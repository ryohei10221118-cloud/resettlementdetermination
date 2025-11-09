/**
 * 博彩注單重新結算檢測工具
 *
 * 功能：
 * 1. 檢測注單是否經過重新結算
 * 2. 提取重新結算的詳細資訊
 * 3. 生成快速對話訊息
 *
 * 支援兩種數據格式：
 * - Format 1: Transaction Log (Array of transactions)
 * - Format 2: Ticket Detail (JSON with SettlementHistory)
 */

// ==================== 核心檢測函數 ====================

/**
 * 檢測注單是否有重新結算
 * @param {Object|Array} data - 注單數據（可以是單個物件或交易記錄陣列）
 * @returns {Object} 檢測結果
 */
function detectResettlement(data) {
  // 如果是陣列，檢查是否有多次 credit_customer 操作
  if (Array.isArray(data)) {
    return detectResettlementFromTransactions(data);
  }

  // 如果是單個物件，檢查 SettlementHistory
  if (data && typeof data === 'object') {
    return detectResettlementFromTicketDetail(data);
  }

  return {
    isResettlement: false,
    method: 'Invalid data format',
    error: 'Data must be an array or object'
  };
}

/**
 * 從交易記錄陣列檢測重新結算
 * @param {Array} transactions - 交易記錄陣列
 * @returns {Object} 檢測結果
 */
function detectResettlementFromTransactions(transactions) {
  // 找出所有 credit_customer 操作
  const creditOperations = transactions.filter(t =>
    t.operationType === 'credit_customer' || t.reqtypeid === 12
  );

  if (creditOperations.length === 0) {
    return {
      isResettlement: false,
      method: 'No credit operations found'
    };
  }

  if (creditOperations.length === 1) {
    // 檢查是否有 IsResettlement 標記
    const hasResettlementFlag = creditOperations[0].reqparams &&
      creditOperations[0].reqparams.includes('IsResettlement="1"');

    if (hasResettlementFlag) {
      return {
        isResettlement: true,
        method: 'IsResettlement flag in XML',
        creditCount: 1,
        operations: creditOperations
      };
    }

    return {
      isResettlement: false,
      method: 'Single credit operation without resettlement flag',
      creditCount: 1
    };
  }

  // 多次 credit 操作 = 有重新結算
  const details = creditOperations.map(op => {
    const statusMatch = op.reqparams ?
      op.reqparams.match(/OldStatus="([^"]+)" NewStatus="([^"]+)"/) : null;

    return {
      id: op.id,
      date: op.creationdate,
      amount: op.amount,
      balance: op.balance,
      oldStatus: statusMatch ? statusMatch[1] : 'Unknown',
      newStatus: statusMatch ? statusMatch[2] : 'Unknown',
      requestId: op.requestid
    };
  });

  return {
    isResettlement: true,
    method: 'Multiple credit_customer operations',
    creditCount: creditOperations.length,
    operations: details,
    purchaseId: creditOperations[0].opLogPurchaseId ||
                creditOperations[0].queryparams?.match(/"purchase_id":"([^"]+)"/)?.[1]
  };
}

/**
 * 從注單詳情 JSON 檢測重新結算
 * @param {Object} ticketDetail - 注單詳情物件
 * @returns {Object} 檢測結果
 */
function detectResettlementFromTicketDetail(ticketDetail) {
  // 方法 1: 檢查 SettlementHistory 長度
  if (ticketDetail.SettlementHistory && Array.isArray(ticketDetail.SettlementHistory)) {
    if (ticketDetail.SettlementHistory.length > 1) {
      const settlements = ticketDetail.SettlementHistory.map(h => ({
        date: h.DateUpdated,
        oldStatus: getBetStatusName(h.OldBetStatus),
        newStatus: getBetStatusName(h.NewBetStatus),
        gain: h.Gain,
        previousBalance: h.PreviousBalance,
        employeeId: h.EmployeeId,
        accountOperationId: h.AccountOperationId
      }));

      return {
        isResettlement: true,
        method: 'Multiple settlement history entries',
        settlementCount: ticketDetail.SettlementHistory.length,
        settlements: settlements,
        ticketId: ticketDetail.SQLTicketId,
        purchaseId: ticketDetail.ReserveId
      };
    }

    // 檢查單次結算是否為重新結算（OldBetStatus 為已結算狀態）
    if (ticketDetail.SettlementHistory.length === 1) {
      const settlement = ticketDetail.SettlementHistory[0];
      const oldStatus = settlement.OldBetStatus;

      // 2=Won, 3=Draw, 4=Lost 都是已結算狀態
      if (oldStatus >= 2 && oldStatus <= 4) {
        return {
          isResettlement: true,
          method: 'Status change from settled state',
          settlementCount: 1,
          settlements: [{
            date: settlement.DateUpdated,
            oldStatus: getBetStatusName(oldStatus),
            newStatus: getBetStatusName(settlement.NewBetStatus),
            gain: settlement.Gain,
            employeeId: settlement.EmployeeId
          }],
          ticketId: ticketDetail.SQLTicketId
        };
      }
    }
  }

  // 方法 2: 檢查 ProcessedInputs
  if (ticketDetail.ProcessedInputs) {
    for (const key in ticketDetail.ProcessedInputs) {
      const inputs = ticketDetail.ProcessedInputs[key];
      if (Array.isArray(inputs) && inputs.length > 1) {
        return {
          isResettlement: true,
          method: 'Multiple processed inputs',
          inputCount: inputs.length,
          processedInputs: ticketDetail.ProcessedInputs,
          ticketId: ticketDetail.SQLTicketId
        };
      }
    }
  }

  return {
    isResettlement: false,
    method: 'No resettlement detected in ticket detail'
  };
}

/**
 * 將注單狀態代碼轉換為名稱
 * @param {number} statusCode - 狀態代碼
 * @returns {string} 狀態名稱
 */
function getBetStatusName(statusCode) {
  const statusMap = {
    0: 'Opened',
    1: 'Pending',
    2: 'Won',
    3: 'Draw',
    4: 'Lost',
    5: 'Cancelled',
    6: 'Cashout'
  };
  return statusMap[statusCode] || `Unknown(${statusCode})`;
}

// ==================== 快速對話生成器 ====================

/**
 * 生成重新結算的快速對話訊息（中文版）
 * @param {Object} detectionResult - detectResettlement 的回傳結果
 * @returns {string} 格式化的對話訊息
 */
function generateQuickReplyMessage(detectionResult) {
  if (!detectionResult.isResettlement) {
    return '✅ 此注單無重新結算記錄';
  }

  let message = '⚠️ 偵測到重新結算\n';
  message += '━━━━━━━━━━━━━━━━\n\n';

  // 基本資訊
  if (detectionResult.ticketId) {
    message += `📋 注單ID: ${detectionResult.ticketId}\n`;
  }
  if (detectionResult.purchaseId) {
    message += `🎫 Purchase ID: ${detectionResult.purchaseId}\n`;
  }
  message += `🔍 檢測方式: ${getMethodDescription(detectionResult.method)}\n\n`;

  // 詳細結算記錄
  if (detectionResult.settlements && detectionResult.settlements.length > 0) {
    message += `📊 結算歷程 (共 ${detectionResult.settlements.length} 次):\n`;
    message += '━━━━━━━━━━━━━━━━\n';

    detectionResult.settlements.forEach((settlement, index) => {
      message += `\n【第 ${index + 1} 次結算】\n`;
      message += `⏰ 時間: ${formatDateTime(settlement.date)}\n`;
      message += `📍 狀態變化: ${settlement.oldStatus} → ${settlement.newStatus}\n`;
      message += `💰 金額: ${settlement.gain || 'N/A'}\n`;

      if (settlement.previousBalance !== undefined) {
        message += `💵 前次餘額: ${settlement.previousBalance}\n`;
      }

      if (settlement.employeeId) {
        const isManual = settlement.employeeId > 0;
        message += `👤 操作: ${isManual ? '人工介入 (ID: ' + settlement.employeeId + ')' : '系統自動'}\n`;
      }

      if (index < detectionResult.settlements.length - 1) {
        message += '─────────────────\n';
      }
    });
  } else if (detectionResult.operations && detectionResult.operations.length > 0) {
    message += `📊 交易記錄 (共 ${detectionResult.operations.length} 次):\n`;
    message += '━━━━━━━━━━━━━━━━\n';

    detectionResult.operations.forEach((op, index) => {
      message += `\n【第 ${index + 1} 次】\n`;
      message += `⏰ 時間: ${formatDateTime(op.date)}\n`;
      message += `📍 狀態: ${op.oldStatus} → ${op.newStatus}\n`;
      message += `💰 金額: ${op.amount}\n`;
      message += `💵 餘額: ${op.balance}\n`;

      if (index < detectionResult.operations.length - 1) {
        message += '─────────────────\n';
      }
    });
  }

  message += '\n━━━━━━━━━━━━━━━━\n';
  message += '⚠️ 請注意：此注單經過重新結算\n';
  message += '建議核對最終結算金額與狀態';

  return message;
}

/**
 * 生成重新結算的快速對話訊息（英文版）
 * @param {Object} detectionResult - detectResettlement 的回傳結果
 * @returns {string} 格式化的對話訊息
 */
function generateQuickReplyMessageEN(detectionResult) {
  if (!detectionResult.isResettlement) {
    return '✅ No resettlement detected for this bet';
  }

  let message = '⚠️ RESETTLEMENT DETECTED\n';
  message += '━━━━━━━━━━━━━━━━\n\n';

  // Basic info
  if (detectionResult.ticketId) {
    message += `📋 Ticket ID: ${detectionResult.ticketId}\n`;
  }
  if (detectionResult.purchaseId) {
    message += `🎫 Purchase ID: ${detectionResult.purchaseId}\n`;
  }
  message += `🔍 Detection Method: ${detectionResult.method}\n\n`;

  // Settlement history
  if (detectionResult.settlements && detectionResult.settlements.length > 0) {
    message += `📊 Settlement History (${detectionResult.settlements.length} times):\n`;
    message += '━━━━━━━━━━━━━━━━\n';

    detectionResult.settlements.forEach((settlement, index) => {
      message += `\n【Settlement #${index + 1}】\n`;
      message += `⏰ Time: ${formatDateTime(settlement.date)}\n`;
      message += `📍 Status: ${settlement.oldStatus} → ${settlement.newStatus}\n`;
      message += `💰 Amount: ${settlement.gain || 'N/A'}\n`;

      if (settlement.previousBalance !== undefined) {
        message += `💵 Previous Balance: ${settlement.previousBalance}\n`;
      }

      if (settlement.employeeId) {
        const isManual = settlement.employeeId > 0;
        message += `👤 Operation: ${isManual ? 'Manual (ID: ' + settlement.employeeId + ')' : 'Automatic'}\n`;
      }

      if (index < detectionResult.settlements.length - 1) {
        message += '─────────────────\n';
      }
    });
  } else if (detectionResult.operations && detectionResult.operations.length > 0) {
    message += `📊 Transaction Log (${detectionResult.operations.length} times):\n`;
    message += '━━━━━━━━━━━━━━━━\n';

    detectionResult.operations.forEach((op, index) => {
      message += `\n【Transaction #${index + 1}】\n`;
      message += `⏰ Time: ${formatDateTime(op.date)}\n`;
      message += `📍 Status: ${op.oldStatus} → ${op.newStatus}\n`;
      message += `💰 Amount: ${op.amount}\n`;
      message += `💵 Balance: ${op.balance}\n`;

      if (index < detectionResult.operations.length - 1) {
        message += '─────────────────\n';
      }
    });
  }

  message += '\n━━━━━━━━━━━━━━━━\n';
  message += '⚠️ Note: This bet has been resettled\n';
  message += 'Please verify the final settlement amount and status';

  return message;
}

/**
 * 生成簡短摘要訊息
 * @param {Object} detectionResult - detectResettlement 的回傳結果
 * @returns {string} 簡短摘要
 */
function generateShortSummary(detectionResult) {
  if (!detectionResult.isResettlement) {
    return '✅ 無重新結算';
  }

  const count = detectionResult.settlementCount || detectionResult.creditCount || 0;
  return `⚠️ 重新結算 (${count}次)`;
}

// ==================== 輔助函數 ====================

/**
 * 格式化日期時間
 * @param {string} dateString - ISO 日期字串
 * @returns {string} 格式化的日期時間
 */
function formatDateTime(dateString) {
  if (!dateString) return 'N/A';

  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return dateString;
  }
}

/**
 * 將檢測方式代碼轉換為中文描述
 * @param {string} method - 檢測方式
 * @returns {string} 中文描述
 */
function getMethodDescription(method) {
  const methodMap = {
    'Multiple settlement history entries': '多次結算記錄',
    'Multiple credit_customer operations': '多次信用操作',
    'Status change from settled state': '從已結算狀態變更',
    'Multiple processed inputs': '多次處理輸入',
    'IsResettlement flag in XML': 'XML重新結算標記'
  };
  return methodMap[method] || method;
}

// ==================== 批量處理函數 ====================

/**
 * 批量檢測多個注單
 * @param {Array} dataArray - 注單數據陣列
 * @returns {Array} 檢測結果陣列
 */
function batchDetectResettlement(dataArray) {
  if (!Array.isArray(dataArray)) {
    return [];
  }

  return dataArray.map((data, index) => {
    const result = detectResettlement(data);
    return {
      index: index,
      data: data,
      result: result,
      hasResettlement: result.isResettlement
    };
  });
}

/**
 * 過濾出有重新結算的注單
 * @param {Array} dataArray - 注單數據陣列
 * @returns {Array} 只包含重新結算注單的陣列
 */
function filterResettlementBets(dataArray) {
  const batchResults = batchDetectResettlement(dataArray);
  return batchResults.filter(r => r.hasResettlement);
}

// ==================== 導出（用於 Node.js 環境）====================
// 如果在 Node.js 環境中使用，取消下方註解
/*
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectResettlement,
    detectResettlementFromTransactions,
    detectResettlementFromTicketDetail,
    generateQuickReplyMessage,
    generateQuickReplyMessageEN,
    generateShortSummary,
    batchDetectResettlement,
    filterResettlementBets,
    getBetStatusName
  };
}
*/

// ==================== 測試範例 ====================

/**
 * 測試函數 - 使用你提供的數據
 */
function testWithSampleData() {
  console.log('========================================');
  console.log('🧪 重新結算檢測測試');
  console.log('========================================\n');

  // 測試數據 1: 交易記錄陣列（你提供的第一串數據）
  const transactionLog = [
    {
      "id": "1703265824",
      "operationType": "credit_customer",
      "amount": "1000.00",
      "creationdate": "2025-11-08T20:22:22.894Z",
      "reqparams": "<Bet ... IsResettlement=\"0\" OldStatus=\"Opened\" NewStatus=\"Draw\" .../>"
    },
    {
      "id": "1703298117",
      "operationType": "credit_customer",
      "amount": "1060.00",
      "creationdate": "2025-11-08T20:48:27.554Z",
      "reqparams": "<Bet ... IsResettlement=\"1\" OldStatus=\"Draw\" NewStatus=\"Won\" .../>"
    }
  ];

  console.log('【測試 1】交易記錄陣列格式');
  console.log('─────────────────────────────────────');
  const result1 = detectResettlement(transactionLog);
  console.log('檢測結果:', result1);
  console.log('\n快速對話訊息:');
  console.log(generateQuickReplyMessage(result1));
  console.log('\n\n');

  // 測試數據 2: 注單詳情 JSON（你提供的第二串數據）
  const ticketDetail = {
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
    ]
  };

  console.log('【測試 2】注單詳情 JSON 格式');
  console.log('─────────────────────────────────────');
  const result2 = detectResettlement(ticketDetail);
  console.log('檢測結果:', result2);
  console.log('\n快速對話訊息:');
  console.log(generateQuickReplyMessage(result2));
  console.log('\n簡短摘要:', generateShortSummary(result2));
}

// 在 Google Apps Script 中執行測試，請取消下方註解
// testWithSampleData();
