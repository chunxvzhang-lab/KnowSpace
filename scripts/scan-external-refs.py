"""
扫一遍打包后的 app.asar，看里面到底有哪些"外部地址"，以及它们住在哪个包里。

为什么要按文件找而不是数总数：`dist/`（渲染层真正加载的那份）可以是干净的，而 asar 里
还装着 node_modules —— 一个库的 README、一个没被调用的兜底分支、一份示例配置，都会让
总数看着吓人，却和"这个应用运行时会不会联网"毫无关系。判断这件事要看**字符串住在哪**，
不看它出现多少次。

用法：
    python scripts/scan-external-refs.py [asar 路径]

默认扫 release/KnowSpace-win-x64/resources/app.asar。
"""
import json
import pathlib
import struct
import sys

NEEDLES = [
    b"cdn.",
    b"unpkg",
    b"jsdelivr",
    b"fonts.googleapis",
    b"googleapis.com",
    b"api.github.com",
    b"http://localhost",
]

DEFAULT_ASAR = "release/KnowSpace-win-x64/resources/app.asar"


def read_asar(path: pathlib.Path):
    """Returns (header_json, files) where files are (name, offset, size)."""
    data = path.read_bytes()
    json_length = struct.unpack("<I", data[12:16])[0]
    header = json.loads(data[16 : 16 + json_length])

    files = []
    stack = [("", header["files"])]
    while stack:
        prefix, entries = stack.pop()
        for name, entry in entries.items():
            full = f"{prefix}{name}"
            if "files" in entry:
                stack.append((full + "/", entry["files"]))
            else:
                files.append((full, int(entry.get("offset", 0)), int(entry["size"])))
    return header, files, data


def main() -> int:
    target = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ASAR)
    if not target.exists():
        print(f"找不到 {target} —— 先打包（npm run desktop:pack）。")
        return 1

    _, files, data = read_asar(target)
    print(f"{target}: {len(files)} 个文件，{len(data) / 1048576:.2f} MB\n")

    hits_by_file = []
    for name, offset, size in files:
        if size == 0 or size > 20 * 1024 * 1024:
            continue
        blob = data[offset : offset + size]
        counts = {n.decode(): blob.count(n) for n in NEEDLES}
        counts = {k: v for k, v in counts.items() if v}
        if counts:
            hits_by_file.append((name, counts, sum(counts.values())))

    hits_by_file.sort(key=lambda item: item[2], reverse=True)

    if not hits_by_file:
        print("没有任何外部地址 —— 这个包里不存在指向 CDN 或 API 的字符串。")
        return 0

    print(f"命中 {len(hits_by_file)} 个文件：\n")
    for name, counts, _total in hits_by_file[:40]:
        detail = ", ".join(f"{k}×{v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1]))
        print(f"  {name}\n      {detail}")

    print("\n判断口径：dist/ 下的命中会真的被渲染层加载；node_modules 下的要看那个包有没有被 import、")
    print("以及那段代码是不是运行时会走到的分支。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
