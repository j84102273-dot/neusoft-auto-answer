#!/usr/bin/env python3
"""
东软学习平台自动答题 - Python/Playwright 备用方案
当 Tampermonkey 脚本不可用时使用此方案

依赖安装:
    pip install playwright httpx rich
    playwright install chromium

用法:
    python neusoft_auto_answer.py
"""

import asyncio
import json
import os
import random
import re
import sys
from pathlib import Path

# ========== 配置 ==========
CONFIG = {
    "login_url": "https://study.neusoft.edu.cn/index",
    "deepseek_api_key": "YOUR_DEEPSEEK_API_KEY",  # DeepSeek API Key
    "deepseek_api_url": "https://api.deepseek.com/v1/chat/completions",
    "delay_ms": 2000,           # 每题间隔
    "jitter_ms": 1500,          # 随机抖动
    "headless": False,          # True=无头模式, False=显示浏览器
    "auto_next": True,          # 自动翻页
    "max_pages": 0,             # 最大翻页数（0=不限制）
}

# ========== 选择器策略（Element Plus 优先） ==========
SELECTORS = {
    "question_block": [
        ".el-form-item:has(.el-radio), .el-form-item:has(.el-checkbox)",
        ".question-item",
        ".exam-item",
        ".que-item",
        "[class*='question']",
        "[class*='topic']",
        ".el-card",
    ],
    "question_text": [
        ".el-form-item__label",
        ".question-title",
        "[class*='title']",
        "[class*='stem']",
        "h1, h2, h3, h4",
    ],
    "option_radio": [
        ".el-radio",
        ".el-checkbox",
        "input[type='radio']",
        "input[type='checkbox']",
        "label:has(input[type='radio'])",
        "label:has(input[type='checkbox'])",
    ],
    "next_button": [
        ".el-pagination .btn-next",
        "button:has-text('下一页')",
        "button:has-text('下一题')",
        "a:has-text('下一页')",
        "[class*='next']",
    ],
}


def get_api_key():
    """获取 API Key"""
    key = CONFIG["deepseek_api_key"]
    # 尝试从环境变量读取
    env_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if env_key and "sk-" in env_key:
        key = env_key
    if not key or "你的key" in key:
        print("❌ 请先设置 DeepSeek API Key！")
        print("   方法1: 修改本脚本 CONFIG['deepseek_api_key']")
        print("   方法2: 设置环境变量 DEEPSEEK_API_KEY")
        sys.exit(1)
    return key


async def ask_deepseek(question_text: str, options: list, qtype: str = "singleChoice") -> dict:
    """调用 DeepSeek API 获取答案"""
    import httpx

    api_key = get_api_key()
    option_labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    options_text = "\n".join([
        f"{option_labels[i]}. {opt['text']}"
        for i, opt in enumerate(options)
    ])

    type_name = {"singleChoice": "单选题", "multiChoice": "多选题", "trueFalse": "判断题"}
    answer_format = '"answers": ["A", "C"]' if qtype == "multiChoice" else '"answer": "A"'

    prompt = f"""你是答题助手。请回答以下{type_name.get(qtype, '题目')}。

题目：{question_text}

选项：
{options_text}

只返回 JSON（不要额外内容）：
{{
  {answer_format},
  "reason": "一句话解释"
}}"""

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            CONFIG["deepseek_api_url"],
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
        )
        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()

        # 提取 JSON
        match = re.search(r"\{[\s\S]*\}", content)
        if not match:
            raise ValueError(f"回复非 JSON: {content[:100]}")
        return json.loads(match.group())


async def fill_answer(page, question_block, options: list, answer_data: dict, qtype: str):
    """在页面上填写答案"""
    option_labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    target_indices = []

    if qtype == "multiChoice":
        answers = answer_data.get("answers") or [answer_data.get("answer", "A")]
        target_indices = [
            option_labels.index(str(a).upper())
            for a in answers
            if str(a).upper() in option_labels
        ]
    else:
        answer = answer_data.get("answer", "A")
        idx = option_labels.index(str(answer).upper()) if str(answer).upper() in option_labels else 0
        target_indices = [idx]

    target_indices = [i for i in target_indices if 0 <= i < len(options)]

    for idx in target_indices:
        opt = options[idx]
        # 尝试点击 Element Plus 组件
        el_radio = await question_block.query_selector(f".el-radio:nth-child({idx + 1})")
        if el_radio:
            await el_radio.click()
            continue
        # 通用点击
        if opt.get("locator"):
            await opt["locator"].click()

    return len(target_indices) > 0


async def extract_questions(page):
    """从当前页面提取题目"""
    questions = []

    for selector in SELECTORS["question_block"]:
        try:
            blocks = await page.query_selector_all(selector)
            if not blocks:
                continue

            for block in blocks:
                # 提取题干
                question_text = ""
                for text_sel in SELECTORS["question_text"]:
                    text_el = await block.query_selector(text_sel)
                    if text_el:
                        question_text = (await text_el.text_content()).strip()
                        break
                if not question_text:
                    question_text = (await block.text_content()).strip()

                # 提取选项
                options = []
                for opt_sel in SELECTORS["option_radio"]:
                    opt_els = await block.query_selector_all(opt_sel)
                    if opt_els:
                        for el in opt_els:
                            text = (await el.text_content()).strip()
                            if text:
                                options.append({"text": text, "locator": el})
                        break

                if question_text and len(options) >= 2:
                    # 判断题型
                    qtype = "singleChoice"
                    if "checkbox" in (await block.evaluate("el => el.innerHTML")):
                        qtype = "multiChoice"
                    if len(options) == 2:
                        combined = question_text + " " + " ".join(o["text"] for o in options)
                        if re.search(r"对|错|正确|错误|true|false|是|否", combined, re.IGNORECASE):
                            qtype = "trueFalse"

                    questions.append({
                        "block": block,
                        "text": question_text,
                        "options": options,
                        "type": qtype,
                    })

            if questions:
                print(f"✅ 使用选择器 '{selector}' 找到 {len(questions)} 道题")
                return questions

        except Exception as e:
            continue

    return questions


async def click_next(page):
    """点击下一页"""
    for sel in SELECTORS["next_button"]:
        try:
            btn = await page.query_selector(sel)
            if btn and await btn.is_visible():
                await btn.click()
                return True
        except Exception:
            continue
    return False


async def main():
    """主流程"""
    from playwright.async_api import async_playwright

    api_key = get_api_key()

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=CONFIG["headless"],
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        )
        page = await context.new_page()

        print(f"🌐 打开: {CONFIG['login_url']}")
        await page.goto(CONFIG["login_url"], wait_until="networkidle")

        print("=" * 50)
        print("📌 请手动登录并导航到答题页面")
        print("   登录完成后按 Enter 继续...")
        print("=" * 50)
        input()

        page_num = 1
        total_ok = 0
        total_err = 0

        while True:
            print(f"\n📄 第 {page_num} 页")

            questions = await extract_questions(page)
            if not questions:
                print("❌ 当前页未找到题目")
                break

            print(f"   找到 {len(questions)} 道题")
            await asyncio.sleep(1)

            for i, q in enumerate(questions):
                # 高亮
                await q["block"].evaluate("el => el.style.outline = '2px solid #00d4aa'")

                try:
                    answer = await ask_deepseek(q["text"], q["options"], q["type"])
                    filled = await fill_answer(page, q["block"],
                                               q["options"], answer, q["type"])
                    await q["block"].evaluate(
                        f"el => el.style.outline = '2px solid {'#2ecc71' if filled else '#e74c3c'}'"
                    )
                    if filled:
                        total_ok += 1
                        print(f"   #{total_ok + total_err} ✓ {(answer.get('reason', '')[:50])}")
                    else:
                        total_err += 1
                        print(f"   #{total_ok + total_err} ✗ 填写失败")
                except Exception as e:
                    total_err += 1
                    await q["block"].evaluate("el => el.style.outline = '2px solid #e74c3c'")
                    print(f"   #{total_ok + total_err} ✗ {e}")

                # 随机延迟
                delay = CONFIG["delay_ms"] / 1000 + random.random() * CONFIG["jitter_ms"] / 1000
                await asyncio.sleep(delay)

            # 翻页
            if not CONFIG["auto_next"]:
                print("自动翻页已关闭，答题结束")
                break
            if CONFIG["max_pages"] > 0 and page_num >= CONFIG["max_pages"]:
                print(f"已达最大页数 {CONFIG['max_pages']}")
                break

            print("翻页中...")
            has_next = await click_next(page)
            if not has_next:
                print("未找到下一页按钮，答题结束")
                break

            await asyncio.sleep(3)
            page_num += 1

        print(f"\n✅ 完成！共 {total_ok + total_err} 题，成功 {total_ok}，失败 {total_err}")
        await browser.close()


if __name__ == "__main__":
    print("=" * 50)
    print("🤖 东软自动答题 - Python/Playwright 版")
    print("=" * 50)
    asyncio.run(main())
