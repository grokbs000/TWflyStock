# 台股飆股篩選器 TODO

## 資料庫與後端
- [x] 設計並建立資料庫 schema（watchlist、screener_results、screener_settings、screener_history）
- [x] 安裝 Python 依賴（yfinance、pandas、numpy、flask）
- [x] 建立 Python 技術指標計算服務（Flask API on port 5001）
- [x] 實作 MA 多頭排列計算（5/10/20/40日均線扇形向上）
- [x] 實作成交量放大篩選（>10日均量1.5倍）
- [x] 實作 OBV 上升趨勢且創新高
- [x] 實作 VR(26) > 120 計算
- [x] 實作長紅K + 突破前波高點偵測
- [x] 建立台股股票清單（67支主要上市股票）
- [x] 使用 ThreadPoolExecutor 並行掃描（10 執行緒，約 2.4 秒完成）
- [x] 修正 numpy bool 序列化問題（自定義 JSON encoder）
- [x] 修正 yfinance MultiIndex 問題（改用 Ticker.history()）
- [x] tRPC 路由：screener.run（執行篩選）
- [x] tRPC 路由：screener.getLatestResults（取得最新結果）
- [x] tRPC 路由：screener.getHistory（取得歷史記錄）
- [x] tRPC 路由：screener.getSettings（取得篩選設定）
- [x] tRPC 路由：screener.updateSettings（更新篩選設定）
- [x] tRPC 路由：screener.getStockChart（取得個股圖表數據）
- [x] tRPC 路由：watchlist.list、add、remove、isWatching
- [x] tRPC 路由：notifications.list、unreadCount、markRead

## 前端界面
- [x] 設計整體視覺風格（深色優雅主題、金融科技感）
- [x] AppLayout 側邊欄導航（飆股雷達、觀察清單、篩選歷史、篩選設定）
- [x] 首頁儀表板：統計摘要、最新飆股清單、條件篩選 Tab
- [x] StockCard 元件：股票代碼、名稱、價格、漲幅、5個條件徽章
- [x] StatsBar 統計摘要：掃描數量、符合數量、命中率、篩選日期
- [x] RunScreenerButton 執行篩選按鈕（含載入狀態）
- [x] 個股技術圖表頁面（K線圖、MA線、成交量、OBV、VR）
- [x] 觀察清單頁面（加入/移除股票）
- [x] 歷史記錄頁面（歷史清單 + 詳細結果展示）
- [x] 篩選條件設定頁面（自訂MA天數、成交量倍數、VR閾值、長紅K最小漲幅）
- [x] 登入/登出功能

## 測試與部署
- [x] 撰寫 vitest 單元測試（14 個測試全部通過）
- [x] 儲存最終檢查點

## 待優化（未來版本）
- [ ] 增加更多台股股票（目前 67 支，可擴展至全部上市櫃）
- [ ] 每日收盤後自動排程篩選（需持久化 Python 服務）
- [ ] 股票名稱搜尋功能
- [ ] 匯出篩選結果（CSV/Excel）
- [ ] 手機版 RWD 優化

## 自訂通知功能（新增）
- [x] 後端：新增 screener.runScheduled tRPC 路由（供排程呼叫）
- [x] 後端：自動篩選完成後寫入 notifications 表（每位登入用戶）
- [x] 後端：新增 notifications.list、unreadCount、markAllRead tRPC 路由
- [x] 後端：新增 screener.toggleAutoRun 路由（開啟/關閉每日自動篩選）
- [x] 前端：側邊欄加入通知鈴鐺圖示（顯示未讀數量紅點）
- [x] 前端：建立通知中心頁面（/notifications）
- [x] 前端：通知卡片顯示篩選結果摘要（找到幾支飆股、股票清單）
- [x] 前端：設定頁面加入「每日自動篩選」開關
- [x] 測試：通知功能 vitest 測試（18 個測試全部通過）

## 掃描數量設定（新增）
- [x] 取得全部台股上市+上櫃清單（1958 支：上市 1080 + 上櫃 878）
- [x] schema 新增 scanLimit 欄位（預設 900，範圍 100~全部）
- [x] Python 服務支援 scanLimit 參數，依設定截取股票清單
- [x] 設定頁面新增「掃描股票數量」快速選擇（100/300/500/900/全部）
- [x] 顯示目前股票池總數與預估掃描時間

## Bug 修復
- [x] 修復 Python 服務（port 5001）沙盒重啟後未自動恢復的問題
- [x] 將 Python 服務整合進 Node.js 主進程（child_process spawn），確保自動啟動

## 架構重構（緊急）
- [x] 保留 Python Flask 方案（最穩定），修復生產環境路徑解析
- [x] 修復 build 腳本：自動複製 stock_service.py 到 dist/server/
- [x] 修復 index.ts 路徑解析，支援開發和生產環境

## 緊急修復（用戶回報）
- [x] 登入問題：開發伺服器已正常，用戶已登入
- [x] 服務連線問題：Node.js 自動帶起 Python 服務，後端重試機制已完善
- [x] 篩選功能：已正常運作（尋隆 1466、台化 1326 各 5/5 條件）

## 架構重構（根本修復）
- [x] 安裝 technicalindicators 和 yahoo-finance2 v2 npm 套件
- [x] 修復生產環境路徑：build 腳本自動複製 stock_service.py 到 dist/server/
- [x] 更新 index.ts 路徑解析，支援開發和生產環境
- [x] 保留 Python 子進程，但修復環境變數沙盒問題
- [x] 前端加入服務離線重試按鈕與 5 秒自動輪詢

## 超時修復（緊急）
- [x] 修復篩選超過 300 支股票時失敗的問題（tRPC/HTTP 超時）
- [x] Python 服務改為 SSE 串流，逐批回傳進度（已掃描 X/N 支...）
- [x] Node.js 後端建立 /api/screen-stream SSE 代理端點
- [x] 前端儀表板加入即時進度條（已掃描 X/N 支、百分比、發現飆股數量）
- [x] 手機版 RWD：側邊欄改為底部導航列（bottom tab bar）
- [x] 手機版 RWD：儀表板卡片、統計欄、表格全面自適應小螢幕
- [x] 手機版 RWD：個股技術圖表頁面手機小螢幕優化
- [x] 手機版 RWD：設定頁面、通知頁面手機小螢幕優化
- [x] CSV 匯出：儀表板篩選結果頁面加入「匯出 CSV」按鈕
- [x] CSV 匯出：歷史記錄頁面支持匯出指定歷史篩選結果

## 即時計數器（新增）
- [x] 儀表板上方顯示即時「已讀取股票數量」與「已篩選（符合條件）股票數量」
- [x] 篩選進行中時顯示動態數字，完成後保留最終結果

## 即時飆股預覽 + 停止按鈕（新增）
- [x] RunScreenerButton 加入「停止篩選」按鈕（篩選進行中顯示）
- [x] RunScreenerButton 透過 onMatch 回呼即時回傳每支符合條件的股票
- [x] Dashboard 計數器橫幅下方即時顯示最新找到的飆股（最多 3 張，新的在前）

## 緊急修復
- [x] 修復「飆股篩選啟動中」卡住不動的問題（加入 SSE ping 心跳、進度更新頻率提高至每 10 支）

## 架構重構：改用輪詢取代 SSE（根本修復）
- [x] Python 服務加入 /screen-start（啟動背景 job）和 /screen-status（查詢進度）端點
- [x] Node.js 後端加入 /api/screen-start 和 /api/screen-status 代理端點
- [x] 前端 RunScreenerButton 改用輪詢（每 1 秒查詢一次進度），不依賴 SSE ReadableStream
- [x] 修復 isRunning 狀態可能卡住的問題（加入超時自動重置）

## 緊急修復：Python 服務無法啟動
- [x] 診斷並修復 Python 服務（port 5001）ECONNREFUSED 問題
- [x] 確保 Node.js 啟動時自動帶起 Python 服務，並等待就緒後才接受請求
- [x] 加入 Python 服務啟動失敗時的友善錯誤提示
- [x] 修復 screener.run tRPC 路由：改用背景 job + 輪詢，從根本解決同步 /screen 超時問題

## 生產環境修復（正式版無法篩選）
- [x] 建立 requirements.txt，列出 Flask、yfinance、numpy 等依賴
- [x] package.json 加入 postinstall 腳本，自動安裝 Python 依賴
- [x] build 腳本將 requirements.txt 複製到 dist/server/
- [x] Node.js 啟動時在生產環境自動執行 pip install，確保依賴安裝後再啟動 Python 服務

## 生產環境重建（清空並重新發布）
- [x] 分析生產環境 Python 依賴安裝失敗的根本原因
- [x] 改用可靠方式確保 Python 依賴在生產環境中安裝（多 pip 路徑嘗試 + --break-system-packages）
- [x] 儲存 checkpoint 並發布

## 根本解決方案：將股票篩選邏輯從 Python 改寫為 TypeScript
- [x] 用 TypeScript + yahoo-finance2 套件重寫股票篩選邏輯，取代 Python Flask 服務
- [x] 移除對 Python 進程的依賴，所有篩選在 Node.js 中執行
- [x] 確保生產環境可正常運行（本地測試 online: true, screen-start 正常）

## 緊急修復：TypeScript 引擎篩選結果為零
- [x] 診斷 TypeScript 引擎技術指標計算錯誤（根本原因：yahoo-finance2 v7 API 被 429 封鎖）
- [x] 改用 Yahoo Finance v8 API 直接 fetch，繞過 v7 限制，篩選結果正常（廣達 4/5、中華電 5/5）
