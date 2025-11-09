注單重新結算檢測工具 使用說明
📋 功能介紹
這是一個網頁工具，用於檢測博彩注單是否經過重新結算，並自動生成快速對話訊息。

主要功能
✅ 支援兩種數據格式

格式 1：交易記錄陣列 (Transaction Log Array)
格式 2：注單詳情 JSON (Ticket Detail JSON)
✅ 智能檢測

自動識別數據格式
檢測多次結算記錄
識別狀態變化（Opened → Draw → Won）
檢測 IsResettlement 標記
✅ 快速對話生成

中文版快速對話訊息
英文版快速對話訊息
詳細的 JSON 檢測結果
✅ 一鍵複製

快速複製訊息內容
方便貼到客服系統
🚀 使用方法
方法 1：直接打開 HTML 文件
找到 resettlement_detector.html 文件
用瀏覽器打開（雙擊文件，或右鍵選擇「用瀏覽器打開」）
開始使用！
方法 2：載入範例數據
打開網頁後，點擊「📝 範例 1 (交易記錄)」或「📝 範例 2 (注單詳情)」
點擊「🔍 開始檢測」按鈕
查看檢測結果
方法 3：使用自己的數據
將你的 JSON 數據複製到輸入框
點擊「🔍 開始檢測」按鈕
查看結果並點擊「📋 複製訊息」
📊 支援的數據格式
格式 1：交易記錄陣列
這種格式通常來自資料庫查詢，包含多筆交易記錄。

[
  {
    "id": "1703265824",
    "operationType": "credit_customer",
    "reqtypeid": 12,
    "creationdate": "2025-11-08T20:22:22.894Z",
    "amount": "1000.00",
    "balance": "1000.2100",
    "customerid": 146098876,
    "reserveid": "775089056288182272",
    "reqparams": "<Bet ... OldStatus=\"Opened\" NewStatus=\"Draw\" .../>"
  },
  {
    "id": "1703298117",
    "operationType": "credit_customer",
    "reqtypeid": 12,
    "creationdate": "2025-11-08T20:48:27.554Z",
    "amount": "1060.00",
    "balance": "3090.2100",
    "customerid": 146098876,
    "reserveid": "775089056288182272",
    "reqparams": "<Bet ... IsResettlement=\"1\" OldStatus=\"Draw\" NewStatus=\"Won\" .../>"
  }
]
檢測重點：

同一個 reserveid 有多次 credit_customer 操作
reqparams 中包含 IsResettlement="1"
OldStatus 和 NewStatus 的變化
格式 2：注單詳情 JSON
這種格式通常來自 API 回應，包含完整的注單資訊和結算歷史。

{
  "SQLTicketId": 775089054982303744,
  "ReserveId": 775089056288182272,
  "SettlementHistory": [
    {
      "DateUpdated": "2025-11-08T20:22:22.8257767Z",
      "OldBetStatus": 0,
      "NewBetStatus": 3,
      "Gain": 1000,
      "PreviousBalance": 0,
      "EmployeeId": 0
    },
    {
      "DateUpdated": "2025-11-08T20:48:26.1542776Z",
      "OldBetStatus": 3,
      "NewBetStatus": 2,
      "Gain": 2060,
      "PreviousBalance": 1000,
      "EmployeeId": 1266
    }
  ],
  "ProcessedInputs": {
    "0OU772546805014831106": [
      775092625140416533,
      775098162787717120,
      775099434156748800
    ]
  }
}
檢測重點：

SettlementHistory 陣列長度 > 1
OldBetStatus 為已結算狀態（2=Won, 3=Draw, 4=Lost）
ProcessedInputs 包含多個處理 ID
🔍 檢測邏輯
判斷為重新結算的條件
工具會根據以下條件判斷是否為重新結算：

格式 1（交易記錄陣列）
多次 credit_customer 操作

同一個注單有 2 次以上的 credit_customer 記錄
即使只有 1 次，如果包含 IsResettlement="1" 也判定為重新結算
狀態變化檢測

從 reqparams XML 中提取 OldStatus 和 NewStatus
如果 OldStatus 為已結算狀態（Won/Draw/Lost），則為重新結算
格式 2（注單詳情 JSON）
SettlementHistory 長度

SettlementHistory.length > 1 → 有重新結算
狀態變化檢測

OldBetStatus 為 2/3/4（已結算狀態）→ 重新結算
ProcessedInputs 檢測

任何 key 的陣列長度 > 1 → 有重新結算
💡 使用場景
場景 1：客服查詢
客戶反應注單結果有變化：

查詢該注單的交易記錄或詳情
貼入檢測工具
點擊「🔍 開始檢測」
複製「快速對話」訊息回覆客戶
場景 2：報表分析
需要找出所有重新結算的注單：

從資料庫導出交易記錄
逐筆貼入檢測工具
記錄檢測結果
場景 3：稽核檢查
檢查人工介入的重新結算：

使用格式 2（注單詳情）
查看 EmployeeId 欄位
如果 EmployeeId > 0，表示有人工介入
📝 輸出訊息範例
中文版快速對話
⚠️ 偵測到重新結算
━━━━━━━━━━━━━━━━

📋 注單ID: 775089054982303744
🎫 Purchase ID: 775089056288182272
🔍 檢測方式: 多次結算記錄

📊 結算歷程 (共 2 次):
━━━━━━━━━━━━━━━━

【第 1 次結算】
⏰ 時間: 2025-11-08 20:22:22
📍 狀態變化: Opened → Draw
💰 金額: 1000
💵 前次餘額: 0
👤 操作: 系統自動
─────────────────

【第 2 次結算】
⏰ 時間: 2025-11-08 20:48:26
📍 狀態變化: Draw → Won
💰 金額: 2060
💵 前次餘額: 1000
👤 操作: 人工介入 (ID: 1266)

━━━━━━━━━━━━━━━━
⚠️ 請注意：此注單經過重新結算
建議核對最終結算金額與狀態
英文版
⚠️ RESETTLEMENT DETECTED
━━━━━━━━━━━━━━━━

📋 Ticket ID: 775089054982303744
🎫 Purchase ID: 775089056288182272
🔍 Detection Method: Multiple settlement history entries

📊 Settlement History (2 times):
━━━━━━━━━━━━━━━━

【Settlement #1】
⏰ Time: 2025-11-08 20:22:22
📍 Status: Opened → Draw
💰 Amount: 1000
💵 Previous Balance: 0
👤 Operation: Automatic
─────────────────

【Settlement #2】
⏰ Time: 2025-11-08 20:48:26
📍 Status: Draw → Won
💰 Amount: 2060
💵 Previous Balance: 1000
👤 Operation: Manual (ID: 1266)

━━━━━━━━━━━━━━━━
⚠️ Note: This bet has been resettled
Please verify the final settlement amount and status
⚙️ 技術細節
狀態代碼對照表
代碼	狀態名稱	說明
0	Opened	未結算
1	Pending	待處理
2	Won	贏
3	Draw	平局/退款
4	Lost	輸
5	Cancelled	取消
6	Cashout	提前結算
檢測方式說明
方式	說明
Multiple settlement history entries	結算歷史有多條記錄
Multiple credit_customer operations	有多次信用操作
Status change from settled state	從已結算狀態變更
Multiple processed inputs	有多個處理輸入
IsResettlement flag in XML	XML 中有重新結算標記
🛠️ 進階使用
在其他系統中整合
如果需要在其他系統（如客服系統、管理後台）中整合這個功能：

提取核心程式碼

打開 betting_resettlement_detector.js
複製需要的函數
API 整合

可以將檢測邏輯包裝成 API
或直接在前端使用
自訂訊息格式

修改 generateQuickReplyMessage() 函數
調整訊息格式以符合你的需求
❓ 常見問題
Q1: 為什麼我的數據檢測不出重新結算？
A: 可能的原因：

JSON 格式錯誤，請檢查語法
數據不完整，缺少關鍵欄位
確實沒有重新結算
Q2: 可以批量檢測多個注單嗎？
A: 目前網頁版僅支援單筆檢測。如需批量處理，請使用 betting_resettlement_detector.js 中的 batchDetectResettlement() 函數。

Q3: 如何判斷是人工介入還是系統自動？
A: 查看 EmployeeId 欄位：

EmployeeId = 0 → 系統自動
EmployeeId > 0 → 人工介入
Q4: 網頁工具需要網路連線嗎？
A: 不需要！這是一個純前端工具，所有處理都在瀏覽器中完成，可以離線使用。

📞 技術支援
如有問題或建議，請聯繫開發團隊。

📜 版本記錄
v1.0 (2025-11-09)
✅ 首次發布
✅ 支援兩種數據格式
✅ 中英文訊息生成
✅ 範例數據載入
✅ 一鍵複製功能
