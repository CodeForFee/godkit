# Kế hoạch: viết lại `claude-code-co-che-hoat-dong.md` thành đặc tả để port sang mọi agent

## Mục tiêu (người dùng làm rõ)

Godkit muốn **mọi AI agent (Codex, Cursor, Antigravity…) làm được mọi thứ Claude Code làm, chất lượng tương đương**. Vì vậy tài liệu không chỉ giải thích Claude Code mà phải là **đặc tả tham chiếu để port**: với từng cơ chế, ghi rõ (a) Claude Code làm thế nào, (b) điều gì tạo ra chất lượng (bất biến phải giữ khi port), (c) agent khác hiện có gì, godkit đã phủ gì, còn thiếu gì và cách giả lập.

Mỗi chương cơ chế sẽ có 3 khối cố định:
1. **Cơ chế trong Claude Code** — sâu, đã đối chiếu docs.
2. **Bất biến cần giữ khi port** — 3–6 gạch đầu dòng kiểm được (ví dụ subagent: "context con tách khỏi cha, chỉ summary quay về"; hook: "chạy ngoài model, chặn được trước khi hành động xảy ra").
3. **Trên agent khác và godkit** — bảng Claude Code / Codex / Cursor / Antigravity / godkit hiện có / khoảng trống / cách giả lập (ví dụ hook không có → rule file "instructed" + kiểm sau bằng `godkit verify`). Chỉ ghi những gì có nguồn (docs chính thức của tool đó hoặc `docs/agent-portability.md`, README Compatibility); chỗ chưa xác minh ghi rõ "chưa xác minh".

Thêm chương cuối **Ma trận tương đương + khoảng trống ưu tiên cho godkit** (xếp theo tác động đến chất lượng), dùng làm đầu vào cho việc sửa godkit sau này. Việc sửa code godkit **không** làm trong task này; chỉ đề xuất.

## Context

File `E:\ClaudeCode\harness\subagent\claude-code-co-che-hoat-dong.md` (678 dòng, chưa commit vào git) giải thích cơ chế Claude Code bằng tiếng Việt. Ba phần Subagent, Hooks, Skills đã khá sâu và phần lớn đúng (đã đối chiếu docs `code.claude.com` ngày 05/11/2026). Vấn đề:

- **Thiếu hẳn** các cơ chế người dùng yêu cầu: tools, permission modes + rule syntax, plan mode, memory/CLAUDE.md/AGENTS.md, MCP, worktrees, settings. Context management chỉ nói sơ.
- **Có chỗ sai/thiếu chính xác** (đã kiểm với docs):
  1. §2.3 "Output tool cũ bị xoá trước rồi mới tóm tắt" — docs không nói vậy. Thay bằng bảng "what survives compaction" chính thức (re-read tối đa 5 file gần nhất, plan được inject lại, skill descriptions rebuild, git status mới…).
  2. §2.4 tiêu đề "bốn tính năng phục vụ hai mục đích" nhưng bảng có ba mục đích.
  3. §3.3 Explore/Plan bỏ qua **cả** CLAUDE.md **và** git status snapshot (doc chỉ ghi CLAUDE.md).
  4. §3.4 bộ lọc 1 thiếu `Agent` (bị gỡ khi đạt giới hạn độ sâu lồng).
  5. §3.11 thiếu các built-in agent `claude`, `statusline-setup`, `claude-code-guide`.
  6. §3.8 quét report: docs nói rõ "không phán xét độc hại, không xoá/viết lại" — chỉnh câu chữ.
  7. §4.1 danh sách event chỉ một phần; docs hiện có 33 event → liệt kê đủ theo nhóm.
  8. §4.6 timeout: thiếu ngoại lệ `PreModelSwitch`/`PostModelSwitch` (30s) và `MessageDisplay` (10s).
  9. §6 "resume từ thư mục khác theo bài bên ngoài" → thay bằng hành vi chính thức: picker `/resume` mặc định lọc theo worktree hiện tại, có phím mở rộng sang worktree/project khác.
  10. §1 bảng Codex: dòng "File hướng dẫn repo" — Claude Code đọc `AGENTS.md` **chỉ khi không có CLAUDE.md** (v2.1.277+), có setting `claude-md-and-agents-md`.
  11. §2.2 dẫn "bài phân tích bên ngoài" về context gửi mỗi lượt → thay bằng nguồn chính thức (prompt-caching page).

## Cách làm

Viết lại toàn bộ file (Write), giữ tiếng Việt, giữ nội dung đúng hiện có, sắp xếp lại theo mạch "loop → tools → quyền → bộ nhớ/context → mở rộng → song song/phiên → case study → chọn công cụ". Cấu trúc mới:

1. **Claude Code khác gì Codex** — giữ, rút gọn, sửa dòng AGENTS.md.
2. **Harness và agentic loop** — 3 pha, models, ngắt/điều hướng (`Esc`, tin nhắn xếp hàng), context Claude Code tự chèn (system reminder, attribution).
3. **Tools** *(mới)* — 5 nhóm chính thức; bảng tool built-in theo nhóm (File: Read/Edit/Write/NotebookEdit; Search: Glob/Grep/LSP; Exec: Bash/PowerShell/Monitor; Web: WebFetch/WebSearch; Điều phối: Agent/SendMessage/ListAgents/Skill/AskUserQuestion/EnterPlanMode/ExitPlanMode/EnterWorktree/ExitWorktree/Task*/Cron*/ToolSearch…) kèm cột "cần quyền?"; tên canonical vs nhãn hiển thị; deferred tools + ToolSearch; ghi chú Bash (timeout, chạy nền).
4. **Permission system** *(mới)* — bảng phân tầng theo loại tool; 6 mode (`default`/Manual, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`) + vòng Shift+Tab + thứ tự `--permission-mode` > `defaultMode` > mặc định (auto từ v2.1.283); auto mode classifier (chặn/cho mặc định, gỡ allow rộng như `Bash(*)`, dừng sau 3 lần liên tiếp/20 lần tổng); protected paths; rule syntax deny → ask → allow, specifier, wildcard đặt sau subcommand, lệnh ghép `&&`/`|`, Read/Edit theo gitignore (`//`, `~/`, `/`, `./`), `WebFetch(domain:)`, `Write(path)` không bao giờ khớp; "Yes, don't ask again" ghi vào `.claude/settings.local.json`; "permission do harness ép, không phải model"; ví dụ settings.
5. **Plan mode** *(mới)* — cách vào (`Shift+Tab`, `/plan`, `--permission-mode plan`), lệnh shell khi plan, 3 lựa chọn duyệt, `Ctrl+G`, plan sống qua compaction, quan hệ với subagent Plan và tool `ExitPlanMode`.
6. **Memory: CLAUDE.md, rules, AGENTS.md, auto memory** *(mới)* — 4 tầng (managed/user/project/local) + đường dẫn Windows; thứ tự nạp root→cwd, nối chứ không ghi đè, subdir nạp theo nhu cầu; `@import` tối đa 4 hops; HTML comment bị strip; <200 dòng; `.claude/rules/` với `paths:`; bảng khi nào đọc AGENTS.md; auto memory (vị trí, 4 loại, 200 dòng/25KB, topic file, tắt bằng `autoMemoryEnabled`/env); `claudeMdExcludes`; `/memory`, `/init`, `/doctor prompt-audit`.
7. **Context window và compaction** — mở rộng §2.2–2.3: cái gì nạp lúc đầu; bảng sống sót qua compaction (chính thức); `/compact focus`, `/rewind` summarize, `/autocompact`, `/clear`, `/context`; thrashing; prompt cache (đổi model = lượt không cache).
8. **Settings** *(mới, ngắn)* — 4 file + managed, thứ tự ưu tiên, mảng được merge, `/status`, trust folder, reload nóng.
9. **Subagent** — giữ §3, áp các sửa 3–6 ở trên; thêm `Agent(fork)` deny, fork có thể `isolation: "worktree"`, ví dụ db-reader dùng hook trong frontmatter.
10. **Skills** — giữ §5; bổ sung đủ 20 field frontmatter, biến thế (`${CLAUDE_EFFORT}`, `${CLAUDE_PROJECT_DIR}`…), `skillOverrides`, `/skill-doctor` (v2.1.252+).
11. **Hooks** — giữ §4; danh sách 33 event theo nhóm; sửa timeout; `shell: powershell` trên Windows.
12. **MCP** *(mới)* — transports (http khuyến nghị, sse deprecated, stdio, ws); `claude mcp add` ví dụ; 3 scope + thứ tự local > project > user > plugin > connectors; duyệt `.mcp.json`; `${VAR:-default}`; OAuth `/mcp`; tool search hoãn nạp; giới hạn output 25.000 token/cảnh báo 10.000/>50.000 ký tự lưu file; tự chuyển nền sau 2 phút; tên `mcp__server__tool` và `mcp__plugin_<p>_<s>__<t>`; MCP riêng cho subagent.
13. **Worktrees** *(mới)* — `claude -w <tên>` → `.claude/worktrees/<tên>/`, nhánh `worktree-<tên>`; `EnterWorktree`/`ExitWorktree`; 4 kiểm tra cô lập; quy tắc dọn dẹp; `worktree.baseRef` fresh/head; `--worktree "#1234"`; `.worktreeinclude`; cái gì dùng chung; `${CLAUDE_PROJECT_DIR}` đứng yên còn `cwd` đi theo; hook cho VCS khác git.
14. **Sessions và checkpoints** — giữ §6, sửa mục 9; tách checkpoint rõ hơn.
15. **Plugins** *(mới, ngắn)* — thành phần, manifest, `${CLAUDE_PLUGIN_ROOT}`, namespace `/plugin:skill`.
16. **Case study: godkit dùng các cơ chế này thế nào** *(mới, đối chiếu repo)* — bảng ánh xạ file thật:
    - `.claude-plugin/plugin.json` → `hooks/godkit-hooks.json` (plugin hook).
    - `SessionStart` matcher `startup|resume|clear|compact` (`brief.js`, `lazy-activate.js`) → giải thích vì sao cần `compact`: context do hook thêm bị tóm tắt mất, SessionStart chạy lại sau compaction.
    - `SubagentStart` (`lazy-subagent.js`) → subagent không kế thừa context main nên phải bơm lại luật.
    - `Stop` (`clockout.js`) → chặn kết thúc lượt khi đã sửa file mà chưa có log (mẫu "chưa xong chưa được dừng" + điều kiện thoát).
    - `PreToolUse`/`PostToolUse` Bash, Edit|Write (`work-track.js`, `map-watch.js`).
    - `agents/file-analyzer.md` → subagent tự cấm lồng ("do not delegate"), chỉ ghi 1 file.
    - `AGENTS.md` là nguồn gốc, `CLAUDE.md` là bản sinh ra giống hệt → Claude Code chỉ đọc CLAUDE.md, không trùng context.
    - Ghi chú `docs/agent-portability.md`: Codex coi matcher luôn là regex, nên godkit chọn matcher hợp cả hai cách hiểu.
17. **Bản đồ tổng hợp và cách chọn** — cập nhật bảng, thêm hàng permission rules, rules, MCP, worktree, plan mode.
18. **Tự kiểm chứng** — giữ + thí nghiệm permission (deny thắng allow), MCP (`claude mcp list`, `/mcp`), worktree (`claude -w test` rồi thoát khi sạch).
19. **Mẫu cấu hình Next.js/NestJS** — giữ + khối `permissions`, `.mcp.json`, `.claude/rules/`.
20. **Ma trận tương đương và khoảng trống cho godkit** *(mới, trọng tâm theo mục tiêu)* — một bảng gộp mọi cơ chế × 4 agent × godkit; danh sách khoảng trống xếp hạng (ví dụ: chặn cứng khi không có hook, cô lập context subagent trên Cursor, compaction-safe re-inject, permission/protected paths, plan-mode gate, worktree isolation), mỗi mục có "cách giả lập bằng file/CLI" và "cách kiểm đã đạt".
21. **Giới hạn, nguồn, lịch sử sửa đổi** — cập nhật link docs chính thức (permissions, permission-modes, memory, mcp, worktrees, settings, context-window, tools-reference, how-claude-code-works); thêm mục ngắn "Đã sửa/thêm ngày 05/11/2026".

## Còn phải kiểm trước khi viết (đọc docs, chỉ đọc)

Các chi tiết chưa đối chiếu được; nếu docs không xác nhận thì bỏ hoặc ghi rõ "chưa xác minh":
- skills.md (phần sau offset 100000): ngân sách listing 1% context, bỏ description "từ skill ít dùng nhất".
- sessions.md: trường `SessionStart` khi resume (`seconds_since_last_response`, `prompt_cache_likely_expired`…), `/branch`, `--teleport`, `/desktop`, `/btw`.
- checkpointing.md: chi tiết rewind (khôi phục code/hội thoại/cả hai).
- mcp.md (offset 100000): ngưỡng tool search, `ENABLE_TOOL_SEARCH`, resources `@`, prompts thành `/mcp__server__prompt`.
- prompt-caching.md: sửa CLAUDE.md giữa phiên có áp dụng không.
- agent-teams: biến `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.
- **Docs chính thức của agent khác** để điền cột so sánh: Codex (developers.openai.com/codex: AGENTS.md, hooks, subagents, skills, sandbox/approval modes, MCP, memory/compaction), Cursor (docs.cursor.com: rules, MCP, background agents, hooks nếu có), Antigravity (docs công khai nếu có). Nguồn bên thứ ba chỉ dùng khi không có docs, và đánh dấu.
- Godkit hiện có (đã đọc): hooks Claude+Codex cùng JSON (`hooks/godkit-hooks.json`), rule file sinh từ `AGENTS.md` cho Cursor/Antigravity, skills link theo host, `.agent/` (board, map, log, tasks, sprints) làm bộ nhớ chung, `godkit verify`, `recall`, subagent `file-analyzer`/`architect`. Bảng Compatibility trong README: Cursor/Antigravity không có hook → "enforced vs instructed".

## File thay đổi

- `E:\ClaudeCode\harness\subagent\claude-code-co-che-hoat-dong.md` — viết lại (ước tính ~1.200 dòng). Nằm ngoài working directory của phiên này nên sẽ cần bạn duyệt quyền ghi.
- Không đụng code godkit. Không commit (file đang untracked; task không yêu cầu).
- Theo giao thức godkit của repo harness: kiểm `.agent/BOARD.md` không có claim trùng file này; ghi log ngắn vào `.agent/log/` của repo harness sau khi xong (dùng CLI `node bin/godkit.js` nếu có lệnh claim/log).

## Kiểm chứng

- Mỗi số liệu/tên field/lệnh trong file mới phải có nguồn đã đọc ở trên; grep file mới tìm các cụm "theo các bài" / "bên thứ ba" để chắc chỉ còn ở phần Codex.
- Kiểm anchor mục lục khớp tiêu đề (grep `^## ` so với danh sách mục lục).
- Kiểm khối code/mermaid đóng mở cân (đếm ``` chẵn).
- Đối chiếu bảng case study với `hooks/godkit-hooks.json`, `agents/file-analyzer.md`, `docs/agent-portability.md` (đọc lại sau khi viết).
- Báo cáo cuối: tóm tắt ngắn các chỗ đã sửa (11 mục trên) và phần thêm mới (8 chương).
