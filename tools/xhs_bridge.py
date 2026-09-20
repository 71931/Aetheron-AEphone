#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""xhs_bridge.py —— 给手机上的 Aetheron 站点开一条「小红书通道」。

它干的事：把「小红书 MCP」（默认 http://localhost:18061/mcp）包一层普通 HTTP 接口，并加上跨域头。
因为 MCP 本身不允许网页跨域直连，手机浏览器里的站点没法自己调它；由这个脚本在本机转发一下，
手机上的站点（MCP → 小红书 → 通道地址）就真的能读笔记、看评论、搜笔记了。

用法（跟 MCP 跑在同一台机器上，只用标准库，不用 pip 装东西）：

    python3 xhs_bridge.py --tunnel --mcp http://localhost:18061/mcp --port 18901 --token aetheron

站点是 https（GitHub Pages），浏览器不让它连 http 的通道（本机 localhost 除外）。
所以给手机用的时候加 --tunnel：脚本会顺手开一条免费 https 隧道（走 npx cloudflared），
启动后打印的 https://xxxx.trycloudflare.com 就是「通道地址」，填进站点那一栏，令牌填 aetheron，
点「测连通」看到登录态就成了。（不加 --tunnel 也可以，那就只能同一台机器上的浏览器自己用。）

接口：
    GET  /            状态页（浏览器直接看）
    GET  /status      通道 + 小红书登录状态
    POST /call        {"tool": "get_feed_detail", "args": {...}}   转发任意 MCP 工具
"""
import argparse
import json
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TIMEOUT = 90


class McpClient(object):
    """极简 MCP Streamable HTTP 客户端：initialize → tools/call。"""

    def __init__(self, url, timeout=TIMEOUT):
        self.url = url
        self.timeout = timeout
        self.sid = ""
        self.lock = threading.Lock()
        self.last_init = 0.0

    # ---------- 底层 ----------
    def _post(self, payload, extra_headers=None, need_text=True):
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.sid:
            headers["mcp-session-id"] = self.sid
        if extra_headers:
            headers.update(extra_headers)
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            sid = resp.headers.get("mcp-session-id") or resp.headers.get("Mcp-Session-Id")
            if sid:
                self.sid = sid
            body = resp.read().decode("utf-8", "replace") if need_text else ""
        return body

    @staticmethod
    def _parse(body):
        body = (body or "").strip()
        if not body:
            return None
        if body[0] == "{":
            try:
                return json.loads(body)
            except ValueError:
                return None
        last = None
        for line in body.splitlines():
            line = line.strip()
            if line.startswith("data:"):
                chunk = line[5:].strip()
                try:
                    obj = json.loads(chunk)
                except ValueError:
                    continue
                if isinstance(obj, dict) and ("result" in obj or "error" in obj):
                    last = obj
        return last

    def initialize(self):
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "xhs-bridge", "version": "1.0"},
            },
        }
        self._post(payload)
        try:
            self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        except Exception:
            pass
        self.last_init = time.time()

    def call(self, tool, args):
        with self.lock:
            for attempt in (1, 2):
                try:
                    if not self.sid or attempt == 2:
                        self.initialize()
                    payload = {
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/call",
                        "params": {"name": tool, "arguments": args or {}},
                    }
                    obj = self._parse(self._post(payload))
                    if obj is None:
                        return {"ok": False, "err": "MCP 返回看不懂（可能没开跨域或地址不是 MCP 端点）"}
                    if obj.get("error"):
                        err = obj["error"]
                        return {"ok": False, "err": str(err.get("message") or err.get("code") or err)}
                    result = obj.get("result") or {}
                    text = self._text_of(result)
                    if result.get("isError"):
                        return {"ok": False, "err": text or "工具返回错误"}
                    out = {"ok": True, "text": text}
                    try:
                        parsed = json.loads(text)
                        if isinstance(parsed, (dict, list)):
                            out["data"] = parsed
                    except ValueError:
                        pass
                    return out
                except urllib.error.HTTPError as e:
                    if attempt == 2:
                        return {"ok": False, "err": "MCP HTTP %s %s" % (e.code, e.reason)}
                    self.sid = ""
                except Exception as e:
                    if attempt == 2:
                        return {"ok": False, "err": "连不上 MCP：%s" % e}
                    time.sleep(0.4)
                    self.sid = ""
        return {"ok": False, "err": "未知错误"}

    @staticmethod
    def _text_of(result):
        content = result.get("content")
        if not content:
            return ""
        if isinstance(content, str):
            return content
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
        return "\n".join(parts)


class Handler(BaseHTTPRequestHandler):
    server_version = "xhs-bridge/1.0"
    mcp = None          # type: McpClient
    token = ""

    # ---------- 工具 ----------
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Xhs-Token, Authorization, mcp-session-id")
        self.send_header("Access-Control-Max-Age", "86400")

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _auth_ok(self):
        if not self.token:
            return True
        given = self.headers.get("X-Xhs-Token") or ""
        if not given:
            q = self.path.split("?", 1)
            if len(q) > 1:
                for kv in q[1].split("&"):
                    if kv.startswith("token="):
                        given = kv[6:]
        return given.strip() == self.token

    def log_message(self, fmt, *args):
        sys.stderr.write("[xhs-bridge] %s - %s\n" % (self.address_string(), fmt % args))

    # ---------- 路由 ----------
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if not self._auth_ok():
            self._json({"ok": False, "err": "令牌不对"}, 401)
            return
        path = self.path.split("?", 1)[0]
        if path in ("/status", "/"):
            st = self.mcp.call("check_login_status", {})
            if path == "/":
                html = ("<!doctype html><meta charset='utf-8'><title>xhs-bridge</title>"
                        "<body style='font-family:system-ui;padding:24px;background:#111;color:#eee'>"
                        "<h3>小红书通道（xhs-bridge）</h3>"
                        "<p>MCP 地址：<code>%s</code></p><p>登录状态：%s</p>"
                        "<p>接口：<code>POST /call</code> {\"tool\":\"get_feed_detail\",\"args\":{...}}</p></body>"
                        % (self.mcp.url, json.dumps(st, ensure_ascii=False)))
                body = html.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self._cors()
                self.end_headers()
                self.wfile.write(body)
                return
            self._json({"ok": st.get("ok", False), "text": st.get("text", ""), "err": st.get("err", ""), "mcp": self.mcp.url})
            return
        self._json({"ok": False, "err": "未知路径，用 POST /call"}, 404)

    def do_POST(self):
        if not self._auth_ok():
            self._json({"ok": False, "err": "令牌不对"}, 401)
            return
        path = self.path.split("?", 1)[0]
        if path != "/call":
            self._json({"ok": False, "err": "未知路径，用 POST /call"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            payload = json.loads(raw.decode("utf-8") or "{}")
        except Exception as e:
            self._json({"ok": False, "err": "请求体不是 JSON：%s" % e}, 400)
            return
        tool = str(payload.get("tool") or "").strip()
        args = payload.get("args") if isinstance(payload.get("args"), dict) else {}
        if not tool:
            self._json({"ok": False, "err": "缺少 tool"}, 400)
            return
        out = self.mcp.call(tool, args)
        out["tool"] = tool
        self._json(out)



TUNNEL_RE = None


def _run_tunnel(port):
    """用 npx cloudflared 开一条临时 https 隧道，把打印出来的地址显示给用户。"""
    global TUNNEL_RE
    import re
    import shutil
    import subprocess

    npx = shutil.which("npx") or shutil.which("npx.cmd")
    cmd = None
    if npx:
        cmd = [npx, "-y", "cloudflared", "tunnel", "--url", "http://localhost:%d" % port, "--no-autoupdate"]
    elif shutil.which("cloudflared"):
        cmd = ["cloudflared", "tunnel", "--url", "http://localhost:%d" % port, "--no-autoupdate"]
    if not cmd:
        print("没找到 npx / cloudflared，没法自动开隧道。两条路：")
        print("  ① 装个 Node 再来一次（脚本会自动用 npx cloudflared）")
        print("  ② 自己开隧道，把 https 地址填进站点：cloudflared tunnel --url http://localhost:%d" % port)
        return
    TUNNEL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                universal_newlines=True, bufsize=1)
    except Exception as e:
        print("隧道启动失败：%s" % e)
        return
    shown = False
    for line in iter(proc.stdout.readline, ""):
        m = TUNNEL_RE.search(line or "")
        if m and not shown:
            shown = True
            print("")
            print("==================== 通道地址（填进手机站点这一栏）====================")
            print("    %s" % m.group(0))
            print("    （令牌仍填脚本 --token 的那个，没填就留空）")
            print("====================================================================")
            print("")
        elif not shown and line.strip():
            sys.stderr.write("[tunnel] %s\n" % line.strip()[:200])


def lan_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass
    return ips


def main():
    ap = argparse.ArgumentParser(description="小红书 MCP → 手机站点 的通道桥")
    ap.add_argument("--mcp", default="http://localhost:18061/mcp", help="小红书 MCP 地址")
    ap.add_argument("--host", default="0.0.0.0", help="监听地址")
    ap.add_argument("--port", type=int, default=18901, help="监听端口")
    ap.add_argument("--token", default="", help="访问令牌（站点里的令牌要填一样的）")
    ap.add_argument("--tunnel", action="store_true", help="顺手开一条免费 https 隧道（npx cloudflared），给手机站点的 https 页面用")
    args = ap.parse_args()

    Handler.mcp = McpClient(args.mcp)
    Handler.token = args.token.strip()

    print("小红书通道启动中…… MCP = %s" % args.mcp)
    st = Handler.mcp.call("check_login_status", {})
    print("登录状态：%s" % (st.get("text") or st.get("err") or "未知"))
    if not st.get("ok"):
        print("提示：MCP 还没应答也不影响启动，先在手机上把地址填好，等 MCP 起来再点「测连通」。")

    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print("手机站点里「通道地址」请填（同一网络才能互相访问）：")
    for ip in lan_ips():
        print("    http://%s:%d" % (ip, args.port))
    if args.token:
        print("令牌：%s" % args.token)
    if args.tunnel:
        print("正在开 https 隧道（第一次会下载 cloudflared，稍等）……")
        threading.Thread(target=_run_tunnel, args=(args.port,), daemon=True).start()

    print("Ctrl+C 退出。")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已退出。")


if __name__ == "__main__":
    main()
