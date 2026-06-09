#!/usr/bin/env python3
"""
ChatLink 接口测试脚本（Python 版）
用法: python scripts/test_api.py [API_KEY] [BASE_URL]
"""

import sys
import json
import requests

API_KEY = sys.argv[1] if len(sys.argv) > 1 else ""
BASE_URL = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8080"

GREEN = "\033[0;32m"
RED = "\033[0;31m"
YELLOW = "\033[0;33m"
CYAN = "\033[0;36m"
NC = "\033[0m"

total = 0
passed = 0

def info(msg):
    print(f"  {CYAN}i INFO{NC} {msg}")

def pass_(msg):
    global passed
    passed += 1
    print(f"  {GREEN}v PASS{NC} {msg}")

def fail(msg):
    print(f"  {RED}x FAIL{NC} {msg}")

headers = {}
if API_KEY:
    headers["Authorization"] = f"Bearer {API_KEY}"

print()
print("=" * 45)
print("  ChatLink 接口测试")
print(f"  地址: {BASE_URL}")
print(f"  Key:  {API_KEY if API_KEY else '<未配置>'}")
print("=" * 45)
print()

# ---------- 1. 健康检查 ----------
print(f"{YELLOW}[1/5] 健康检查{NC}")
total += 1
try:
    r = requests.get(f"{BASE_URL}/health", headers=headers, timeout=10)
    if r.status_code == 200:
        pass_(f"GET /health -> {r.status_code}")
    else:
        fail(f"GET /health -> {r.status_code} (期望 200)")
except Exception as e:
    fail(f"GET /health -> 异常: {e}")

# ---------- 2. 根路径 ----------
print(f"{YELLOW}[2/5] 根路径{NC}")
total += 1
try:
    r = requests.get(f"{BASE_URL}/", headers=headers, timeout=10)
    data = r.json()
    if "name" in data and "ChatLink" in str(data["name"]):
        pass_("GET / -> 服务名称正确")
        info(f"版本: {data.get('version', 'N/A')}")
    else:
        fail(f"GET / -> 响应异常: {r.text[:200]}")
except Exception as e:
    fail(f"GET / -> 异常: {e}")

# ---------- 3. 模型列表 ----------
print(f"{YELLOW}[3/5] 模型列表{NC}")
total += 1
try:
    r = requests.get(f"{BASE_URL}/v1/models", headers=headers, timeout=10)
    models = r.json()
    model_ids = [m["id"] for m in models.get("data", [])]
    if model_ids:
        pass_(f"GET /v1/models -> 获取到 {len(model_ids)} 个模型")
        for mid in model_ids[:3]:
            info(f"  模型: {mid}")
    else:
        fail("GET /v1/models -> 无模型或请求失败")
        info(f"响应: {r.text[:200]}")
except Exception as e:
    fail(f"GET /v1/models -> 异常: {e}")
    model_ids = []

# ---------- 4. 非流式 Chat Completions ----------
print(f"{YELLOW}[4/5] 非流式 Chat Completions{NC}")
total += 1
if not model_ids:
    fail("跳过 - 无可用模型")
else:
    first_model = model_ids[0]
    payload = {
        "model": first_model,
        "messages": [{"role": "user", "content": "Say hello in one word."}],
        "stream": False,
        "max_tokens": 50,
    }
    try:
        r = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=payload,
            headers=headers,
            timeout=30,
        )
        if r.status_code == 200:
            content = r.json()["choices"][0]["message"]["content"]
            pass_(f"POST /v1/chat/completions (非流式) -> {r.status_code}")
            info(f"模型: {first_model}")
            info(f"回复: {content[:100]}")
        else:
            fail(f"POST /v1/chat/completions (非流式) -> {r.status_code}")
            info(f"响应: {r.text[:300]}")
    except Exception as e:
        fail(f"POST /v1/chat/completions (非流式) -> 异常: {e}")

# ---------- 5. 流式 Chat Completions ----------
print(f"{YELLOW}[5/5] 流式 Chat Completions (SSE){NC}")
total += 1
if not model_ids:
    fail("跳过 - 无可用模型")
else:
    payload = {
        "model": first_model,
        "messages": [{"role": "user", "content": "Count from 1 to 3."}],
        "stream": True,
        "max_tokens": 100,
    }
    try:
        r = requests.post(
            f"{BASE_URL}/v1/chat/completions",
            json=payload,
            headers=headers,
            stream=True,
            timeout=30,
        )
        chunk_count = 0
        content_parts = []
        for line in r.iter_lines(decode_unicode=True):
            if line:
                if line.startswith("data: "):
                    chunk_count += 1
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        continue
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        if "content" in delta:
                            content_parts.append(delta["content"])
                    except json.JSONDecodeError:
                        pass
        if chunk_count > 0:
            pass_(f"POST /v1/chat/completions (流式) -> 收到 {chunk_count} 个 SSE 数据块")
            preview = "".join(content_parts)[:200]
            info(f"流式内容预览: {preview if preview else '<空>'}")
        else:
            fail("POST /v1/chat/completions (流式) -> 无 SSE 数据")
except Exception as e:
    fail(f"POST /v1/chat/completions (流式) -> 异常: {e}")

# ---------- 总结 ----------
print()
print("=" * 45)
print(f"  测试完成: {GREEN}{passed}{NC}/{total} 通过")
print("=" * 45)
print()

sys.exit(0 if passed == total else 1)
