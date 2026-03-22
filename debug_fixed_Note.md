# TW Stock Screener - Debug & Fixed Note

本文件記錄了在開發與部署至 Vercel 過程中遇到的關鍵問題及其解決方案。

## 1. Vercel 部署：ESM 模組解析錯誤 (ERR_MODULE_NOT_FOUND)

### 問題：
Vercel 運行環境為 Node.js ESM，嚴格要求相對路徑的 `import` 必須包含 `.js` 副檔名。
- 報錯：`Error: Cannot find module './routers' imported from /var/task/api/index.js`

### 解決方案：
手動在所有內部模組引用處加上 `.js`。
- 修改 [server/routers.ts](file:///Users/banson/MyProjects/tw_stock_screener/server/routers.ts) -> `import { ... } from "./_core/sdk.js";`
- 修改 [api/index.ts](file:///Users/banson/MyProjects/tw_stock_screener/api/index.ts) -> `import { createApp } from "../server/_core/index.js";`

---

## 2. SQLite 資料庫路徑與權限問題

### 問題：
Vercel Serverless Function 是**唯讀文件系統**，只有 `/tmp` 目錄可寫。
- 報錯：`Error: SQLITE_CANTOPEN: unable to open database file`

### 解決方案：
1. **目錄遷移**：將資料庫從隱藏的 `.data/` 移至 `data/`，確保其被包含在部署包中。
2. **運行時複製**：在 `server/db.ts` 初始化時，檢查 `/tmp/sqlite.db` 是否存在。若不存在，從 bundle 中的 `data/sqlite.db` 複製一份到 `/tmp`。
3. **權限設定**：使用 `fs.chmodSync(tmpPath, 0o666)` 確保跨實例的可讀寫權限。

---

## 3. Vercel 背景任務中斷 (waitUntil 模式)

### 問題：
Vercel 的 Serverless Function 在回傳 Response 後會立即中斷執行，導致長耗時的「飆股篩選」任務卡在 0% 或 Pending。

### 解決方案：
使用 `@vercel/functions` 的 `waitUntil` API：
1. **安裝套件**：使用 `pnpm add @vercel/functions`。
2. **注入 WaitUntil**：在 `api/index.ts` (Vercel Entry) 將 `req.waitUntil` 傳遞給 App。
3. **異步維持**：在 `server/_core/index.ts` 的 `/api/screen-start` 路由中，將 `startScreenJob` 的 Promise 傳給 `req.waitUntil(...)`，強迫 Vercel 保持實例活性直到篩選完成。

---

## 4. Drizzle ORM 寫入失敗 (LibSQL/SQLite Returning)

### 問題：
原始使用的 `db.insert(...).returning()` 在 Vercel 的 LibSQL 驅動下會因 `id` 為 `null` 而崩潰。
- 報錯：`Failed query: insert into "screener_runs" ("id", ...) values (null, ...)`

### 解決方案：
1. **Raw SQL 繞過**：針對關鍵的插入操作（如 `createScreenerRun`），改用 `db.run(sql`INSERT INTO ...`)`。
2. **ID 獲取**：手動執行 `SELECT last_insert_rowid()` 來獲取新產生的 ID。
3. **排除 ID 欄位**：在其他 Drizzle 插入中使用 `const { id: _, ...rest } = data` 顯式排除 `id`，讓 SQLite 自動遞增。

---

## 5. 自癒式 Schema 恢復機制 (Schema Recovery)

### 問題：
當部署包中的 `sqlite.db` 為舊版本，或 `/tmp` 被清空時，常出現 `no such table: notifications` 等錯誤。

### 解決方案：
在 `server/db.ts` 的 `getDb()` 初始化流程中加入「自癒式 SQL 指令」：
- 手動執行一系列 `CREATE TABLE IF NOT EXISTS` 和 `CREATE INDEX IF NOT EXISTS`。
- 這能確保即使資料庫檔案被重置，系統也能在第一次請求時自動建立正確的表結構。

---

## 6. 進度條永遠顯示 100% Bug

### 問題：
`totalScanned` 欄位被同時兼作「總目標數」與「當前進度」，導致分子分母永遠相等。

### 解決方案：
1. **Schema 擴展**：在 `screener_runs` 表中新增 `totalToScan` 欄位。
2. **邏輯分離**：
   - `totalToScan`：紀錄計畫掃描的總數（分母）。
   - `totalScanned`：紀錄已完成掃描的支數（分子）。
3. **API 更新**：修正 `/api/screen-status` 返回的 JSON 結構，將 `total: run.totalToScan` 正確傳給前端。

---

## 7. 重要建議：Vercel 持久化方案 (Turso)

### 問題：
雖然有 `waitUntil` 和 `/tmp` 方案，但 Vercel 的 Serverless 實例是**隔離且短暫的**。不同請求可能命中不同實例，導致進度查詢出現 404 或資料不同步。

### 解決方案：
強烈建議在 Vercel 生產環境使用 [Turso (Remote LibSQL)](https://turso.tech/)：
1. **申請資料庫**：在 Turso 建立免費資料庫。
2. **設定變數**：在 Vercel Dashboard 設定 `DATABASE_URL` (例如 `libsql://your-db.turso.io`)。
3. **全域一致**：程式碼已封裝好，一旦偵測到 `DATABASE_URL`，將自動實現所有 Vercel 實例間的 100% 資料同步。
