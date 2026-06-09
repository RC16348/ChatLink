#!/usr/bin/env python3
"""
ChatLink 模型批量测试脚本
测试所有可用模型是否能正常响应提示词
"""

import requests
import json
import sys
import time
from urllib.parse import urljoin

BASE_URL = "http://127.0.0.1:8080"
TIMEOUT = 30
TEST_PROMPT = "回复我一个字：好"


def get_models():
    resp = requests.get(urljoin(BASE_URL, "/v1/models"), timeout=10)
    resp.raise_for_status()
    return [m["id"] for m in resp.json()["data"]]


def test_model(model):
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": TEST_PROMPT}],
        "max_tokens": 10,
        "temperature": 0.1,
        "stream": False,
    }
    try:
        start = time.time()
        resp = requests.post(
            urljoin(BASE_URL, "/v1/chat/completions"),
            json=payload,
            timeout=TIMEOUT,
        )
        elapsed = time.time() - start
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}", elapsed
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        if content and content.strip():
            return True, content.strip()[:50], elapsed
        return False, "空响应", elapsed
    except Exception as e:
        return False, str(e), 0


def main():
    print("=" * 60)
    print("  ChatLink 模型批量测试")
    print(f"  服务地址: {BASE_URL}")
    print(f"  测试提示: {TEST_PROMPT}")
    print("=" * 60)

    try:
        models = get_models()
    except Exception as e:
        print(f"\n获取模型列表失败: {e}")
        print("请确保 ChatLink 服务已启动")
        return 1

    print(f"\n共检测到 {len(models)} 个模型\n")

    results = []
    for i, model in enumerate(models, 1):
        print(f"[{i}/{len(models)}] {model} ... ", end="", flush=True)
        ok, msg, elapsed = test_model(model)
        status = "OK" if ok else "FAIL"
        print(f"[{status}] ({elapsed:.2f}s) {msg}")
        results.append((model, ok, elapsed))

    print("\n" + "-" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = len(results) - passed
    print(f"结果: {passed} 通过, {failed} 失败 / 共 {len(results)} 个模型")
    for model, ok, elapsed in results:
        icon = "PASS" if ok else "FAIL"
        print(f"  [{icon}] {model} ({elapsed:.2f}s)")
    print("-" * 60)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
