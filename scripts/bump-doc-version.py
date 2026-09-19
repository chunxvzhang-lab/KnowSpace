"""
把一份文档里的"当前版本"字样提升到目标版本。

发版时要改的版本号散在很多地方：标题、文档信息表、安装命令、卸载项名字、快捷键表的
说明句、附录的修订记录。手工改一遍很容易漏一两处，而**漏掉的那一处会在发布之后很长
时间里继续说着上一个版本**。所以这些替换放在这里，逐条断言"确实找到了"，找不到就
报错退出 —— 一次没改成功的替换，比一次改错的替换更难发现。

用法：
    python scripts/bump-doc-version.py <文件路径> <旧版本> <新版本>

只改"当前版本"的引用，不改历史记录：形如 `| v2.5.0 | 主题 | 内容 |` 的变更表行、
"v2.5.0 新增"这类历史标注都**不在**替换范围内，它们的替换由人按发布内容单独写。
"""
import sys
from pathlib import Path

# 每条是 (旧, 新)，必须逐条命中，否则整体失败。
PATTERNS = [
    # 标题与文档信息表
    ("# KnowSpace 用户手册（v{old}）", "# KnowSpace 用户手册（v{new}）"),
    ("| **v{old}**（`package.json`", "| **v{new}**（`package.json`"),
    ("**v{old} 实际实现**", "**v{new} 实际实现**"),
    # 版本演进一节的标题
    ("（v2.2 → v2.5）", "（v2.2 → v2.6）"),
    # 安装与卸载
    ("`KnowSpace-Setup-{old}.exe`", "`KnowSpace-Setup-{new}.exe`"),
    # 不带反引号：手册里这处出现在代码块中（msiexec 命令）而不是行内代码。
    ("KnowSpace-{old}.msi", "KnowSpace-{new}.msi"),
    ("卸载项 `KnowSpace {old}`", "卸载项 `KnowSpace {new}`"),
    ("（v{old} 未改变任何既有文件格式", "（v{new} 未改变任何既有文件格式"),
    # 快捷键表的依据版本
    ("**v{old} 实际生效**", "**v{new} 实际生效**"),
    ("但 **v{old} 未实现**", "但 **v{new} 未实现**"),
]


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__)
        return 2

    path = Path(sys.argv[1])
    old, new = sys.argv[2], sys.argv[3]
    text = path.read_text(encoding="utf-8")

    missing = []
    for old_pattern, new_pattern in PATTERNS:
        before = old_pattern.format(old=old, new=new)
        after = new_pattern.format(old=old, new=new)
        count = text.count(before)
        if count == 0:
            missing.append(before)
            continue
        text = text.replace(before, after)
        print(f"  {count} 处: {before[:60]}")

    if missing:
        print("\n以下替换没有命中，文档里没有这段文字（版本提升未进行）：")
        for item in missing:
            print(f"  未找到: {item[:80]}")
        return 1

    path.write_text(text, encoding="utf-8")
    print(f"\n已写入 {path}：v{old} → v{new}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
