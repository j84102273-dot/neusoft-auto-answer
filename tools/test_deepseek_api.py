#!/usr/bin/env python3
"""
DeepSeek API 测试脚本
验证你的 API Key 是否可用，以及答题效果
"""

import json
import os
import sys

import httpx

# ========== 配置 ==========
API_KEY = "YOUR_DEEPSEEK_API_KEY"
API_URL = "https://api.deepseek.com/v1/chat/completions"

# 模拟题测试
TEST_QUESTIONS = [
    {
        "type": "singleChoice",
        "text": "Python 中的列表（list）和元组（tuple）的主要区别是什么？",
        "options": [
            "列表可变，元组不可变",
            "列表不可变，元组可变",
            "两者完全相同",
            "两者都不可变",
        ],
    },
    {
        "type": "trueFalse",
        "text": "TCP 协议是面向连接的协议。",
        "options": ["正确", "错误"],
    },
    {
        "type": "multiChoice",
        "text": "以下哪些是有效的 HTTP 请求方法？",
        "options": ["GET", "POST", "FETCH", "DELETE"],
    },
]


def get_api_key():
    key = API_KEY
    env_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if env_key and "sk-" in env_key:
        key = env_key
    if not key or "你的key" in key:
        print("❌ 请先设置 API Key！")
        print("   1. 修改本脚本 API_KEY 变量")
        print("   2. 或设置环境变量: set DEEPSEEK_API_KEY=sk-xxx")
        sys.exit(1)
    return key


def ask(question: dict) -> dict:
    """调用 DeepSeek API"""
    api_key = get_api_key()
    option_labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    options_text = "\n".join([
        f"{option_labels[i]}. {opt}"
        for i, opt in enumerate(question["options"])
    ])

    type_name = {
        "singleChoice": "单选题",
        "multiChoice": "多选题",
        "trueFalse": "判断题",
    }

    answer_format = (
        '"answers": ["A", "C"]'
        if question["type"] == "multiChoice"
        else '"answer": "A"'
    )

    prompt = f"""你是答题助手。请回答以下{type_name.get(question['type'], '题目')}。

题目：{question['text']}

选项：
{options_text}

只返回 JSON（不要额外内容）：
{{
  {answer_format},
  "reason": "一句话解释"
}}"""

    resp = httpx.post(
        API_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json={
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": "你是一个精确的答题助手。只返回 JSON，不返回其他内容。"},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "max_tokens": 500,
        },
        timeout=30,
    )

    if resp.status_code != 200:
        raise Exception(f"HTTP {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    content = data["choices"][0]["message"]["content"].strip()

    # 提取 JSON
    import re
    match = re.search(r"\{[\s\S]*\}", content)
    if not match:
        raise Exception(f"回复非 JSON: {content[:100]}")

    return json.loads(match.group())


def main():
    api_key = get_api_key()
    print("=" * 50)
    print("🧪 DeepSeek API 测试")
    print(f"   Key: {api_key[:10]}...{api_key[-4:]}")
    print("=" * 50)

    total_ok = 0

    for i, q in enumerate(TEST_QUESTIONS):
        print(f"\n📝 测试题 {i + 1} [{q['type']}]: {q['text'][:60]}...")
        try:
            result = ask(q)
            print(f"   ✅ 返回: {json.dumps(result, ensure_ascii=False)}")
            total_ok += 1
        except Exception as e:
            print(f"   ❌ 失败: {e}")

    print("\n" + "=" * 50)
    print(f"结果: {total_ok}/{len(TEST_QUESTIONS)} 道题成功")
    if total_ok == len(TEST_QUESTIONS):
        print("✅ API 工作正常，可以开始使用！")
    else:
        print("⚠️ 部分题目失败，请检查 API Key 或网络")
    print("=" * 50)


if __name__ == "__main__":
    main()
