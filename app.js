// ============================================
// Asset Mall - DApp 前端逻辑
// 适用于 GitHub Pages 静态部署
// ============================================

// 配置 - 根据部署的合约地址修改
const CONFIG = {
  // BSC 主网配置
  chainIdHex: "0x38",
  chainId: 56,
  chainName: "BSC Mainnet",
  rpcUrl: "https://bsc-dataseed.binance.org",
  blockExplorer: "https://bscscan.com",

  // 合约地址 - 请根据实际部署修改
  revenueShare: "0x30851a4af557427c90e3423219709d44cd7b8db5",
  rewarder: "0xc720ae4138c8cc1eaf310c4fe164d0a8d9f6bb93",
  oracle: "0xdc3f09c0ff92d391c1c9b8f4129cd46ca259d377",

  // 管理员钱包地址列表 - 可以添加多个管理员
  // 这些地址将拥有查看和管理所有订单的权限
  adminWallets: [
    // 示例格式（请替换为实际地址）:
    // "0x1234567890123456789012345678901234567890",
    // "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  ]
};

// ABI 定义
const REVENUE_SHARE_ABI = [
  "function owner() view returns (address)",
  "function usdt() view returns (address)",
  "function productCostBps() view returns (uint16)",
  "function rewardBps() view returns (uint16)",
  "function referrerOf(address) view returns (address)",
  "function purchase(uint256 usdtAmount, address referrer, uint256 minAssetAmount)",
  "function previewSplit(address user, uint256 usdtAmount) view returns (address directRecipient, address indirectRecipient, uint256 directAmount, uint256 indirectAmount, uint256 feeAmount, uint256 productCostAmount, uint256 rewardAmount)"
];

const REWARDER_ABI = [
  "function assetToken() view returns (address)",
  "function assetSourceWallet() view returns (address)",
  "function previewReward(uint256 rewardUsdtAmount) view returns (uint256)"
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

// 应用状态
const state = {
  provider: null,
  browserProvider: null,
  signer: null,
  account: null,
  chainId: null,
  adminAddress: ethers.ZeroAddress,
  isAdmin: false,
  revenueShare: null,
  rewarder: null,
  usdt: null,
  asset: null,
  usdtAddress: null,
  assetAddress: null,
  usdtSymbol: "USDT",
  assetSymbol: "ASSET",
  usdtDecimals: 18,
  assetDecimals: 18,
  productCostBps: 0n,
  rewardBps: 0n,
  boundReferrer: ethers.ZeroAddress,
  lastPreviewReward: 0n
};

// UI 元素引用
const ui = {};

// 存储键
const STORAGE_KEY = "assetMallOrdersV1";

// ============================================
// 工具函数
// ============================================

function setStatus(message, type = "") {
  ui.statusBox.textContent = message;
  ui.statusBox.className = "status";
  if (type) ui.statusBox.classList.add(type);
}

function setOrderStatus(message, type = "") {
  ui.orderStatusBox.textContent = message;
  ui.orderStatusBox.className = "status";
  if (type) ui.orderStatusBox.classList.add(type);
}

function shortAddress(value) {
  if (!value || value === ethers.ZeroAddress) return "-";
  return value.slice(0, 6) + "..." + value.slice(-4);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleString("zh-CN");
}

function formatUnits(value, decimals, digits = 6) {
  if (value == null) return "-";
  try {
    const text = ethers.formatUnits(value, decimals);
    const [intPart, fracPart = ""] = text.split(".");
    if (!fracPart) return intPart;
    const trimmedFrac = fracPart.slice(0, digits).replace(/0+$/, "");
    return trimmedFrac ? intPart + "." + trimmedFrac : intPart;
  } catch (e) {
    return "-";
  }
}

function formatPercentFromBps(bps) {
  try {
    return (Number(bps) / 100).toFixed(2).replace(/\.00$/, "") + "%";
  } catch (e) {
    return "-";
  }
}

function parseAmount(value, decimals) {
  const trimmed = String(value).trim();
  if (!trimmed) return 0n;
  try {
    return ethers.parseUnits(trimmed, decimals);
  } catch (e) {
    return 0n;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractError(error) {
  if (error?.info?.error?.message) return error.info.error.message;
  if (error?.shortMessage) return error.shortMessage;
  if (error?.reason) return error.reason;
  if (error?.message) return error.message;
  return "未知错误";
}

function getExplorerLink(hash, type = "tx") {
  if (!hash || hash === "-") return "#";
  return `${CONFIG.blockExplorer}/${type}/${hash}`;
}

// ============================================
// 本地存储订单管理
// ============================================

function loadStoredOrders() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("加载订单失败:", error);
    return [];
  }
}

function saveStoredOrders(orders) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch (error) {
    console.error("保存订单失败:", error);
  }
}

function createOrderNumber() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  const random = Math.floor(Math.random() * 9000 + 1000);
  return "OD" + stamp + random;
}

function generateUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function collectCustomerInfo() {
  return {
    name: ui.customerNameInput.value.trim(),
    phone: ui.customerPhoneInput.value.trim(),
    address: ui.customerAddressInput.value.trim(),
    note: ui.customerNoteInput.value.trim()
  };
}

function validateCustomerInfo() {
  const customer = collectCustomerInfo();
  if (!customer.name) {
    throw new Error("请输入客户姓名。");
  }
  if (!customer.phone) {
    throw new Error("请输入电话号码。");
  }
  if (!customer.address) {
    throw new Error("请输入联系地址。");
  }
  return customer;
}

function upsertOrder(order) {
  const orders = loadStoredOrders();
  const index = orders.findIndex((item) => item.id === order.id);
  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift(order);
  }
  saveStoredOrders(orders);
  renderOrders();
}

function updateOrder(orderId, updates) {
  const orders = loadStoredOrders();
  const index = orders.findIndex((item) => item.id === orderId);
  if (index === -1) return;
  orders[index] = { ...orders[index], ...updates };
  saveStoredOrders(orders);
  renderOrders();
}

function getVisibleOrders() {
  const search = ui.orderSearchInput.value.trim().toLowerCase();
  const status = ui.orderStatusFilter.value;
  const orders = loadStoredOrders();

  return orders.filter((order) => {
    const matchAdmin = state.isAdmin || (state.account && order.wallet?.toLowerCase() === state.account.toLowerCase());
    if (!matchAdmin) return false;
    if (status !== "all" && order.status !== status) return false;
    if (!search) return true;

    const haystack = [
      order.orderNo,
      order.wallet,
      order.name,
      order.phone,
      order.address,
      order.note,
      order.txHash
    ].join(" ").toLowerCase();

    return haystack.includes(search);
  });
}

function getStatusBadge(status) {
  const safe = status || "pending";
  const labelMap = {
    pending: "待处理",
    confirmed: "已确认",
    failed: "失败"
  };
  return '<span class="badge ' + safe + '">' + (labelMap[safe] || safe) + "</span>";
}

function renderOrders() {
  const visibleOrders = getVisibleOrders();
  const confirmedCount = visibleOrders.filter((item) => item.status === "confirmed").length;
  const visibleTotal = visibleOrders.reduce((sum, item) => {
    try {
      return sum + BigInt(item.usdtAmount || "0");
    } catch {
      return sum;
    }
  }, 0n);

  ui.ordersVisibleCount.textContent = String(visibleOrders.length);
  ui.ordersConfirmedCount.textContent = String(confirmedCount);
  ui.ordersUsdtTotal.textContent = formatUnits(visibleTotal, state.usdtDecimals) + " " + state.usdtSymbol;
  ui.adminStatus.textContent = state.isAdmin ? "是" : "否";

  if (visibleOrders.length) {
    setOrderStatus(`已加载 ${visibleOrders.length} 个订单。`, "ok");
  } else {
    setOrderStatus("本地存储中没有匹配的订单。", "");
  }

  if (!visibleOrders.length) {
    ui.ordersTableBody.innerHTML = '<tr><td colspan="7" class="muted">暂无订单。</td></tr>';
    return;
  }

  ui.ordersTableBody.innerHTML = visibleOrders.map((order) => {
    const amountText = formatUnits(BigInt(order.usdtAmount || "0"), state.usdtDecimals) + " " + state.usdtSymbol;
    const rewardText = formatUnits(BigInt(order.assetAmount || "0"), state.assetDecimals) + " " + state.assetSymbol;
    const txLink = getExplorerLink(order.txHash);

    const statusCell = state.isAdmin
      ? '<select data-order-status="' + escapeHtml(order.id) + '">' +
          ['pending', 'confirmed', 'failed'].map((s) =>
            '<option value="' + s + '"' + (order.status === s ? " selected" : "") + ">" +
            (s === "pending" ? "待处理" : s === "confirmed" ? "已确认" : "失败") +
            "</option>"
          ).join("") +
        "</select>"
      : getStatusBadge(order.status);

    return (
      "<tr>" +
        "<td><strong>" + escapeHtml(order.orderNo) + "</strong><small>" + escapeHtml(formatDateTime(order.createdAt)) + "</small></td>" +
        "<td><strong>" + escapeHtml(order.name) + "</strong><small>" + escapeHtml(order.phone) + "<br>" + escapeHtml(order.address) + (order.note ? "<br>备注: " + escapeHtml(order.note) : "") + "</small></td>" +
        "<td><code>" + escapeHtml(shortAddress(order.wallet)) + "</code><small>推荐人: " + escapeHtml(shortAddress(order.referrer)) + "</small></td>" +
        "<td><strong>" + escapeHtml(amountText) + "</strong><small>奖励池: " + escapeHtml(formatUnits(BigInt(order.rewardPoolAmount || "0"), state.usdtDecimals)) + " " + escapeHtml(state.usdtSymbol) + "</small></td>" +
        "<td><strong>" + escapeHtml(rewardText) + "</strong><small>最低: " + escapeHtml(formatUnits(BigInt(order.minAssetAmount || "0"), state.assetDecimals)) + " " + escapeHtml(state.assetSymbol) + "</small></td>" +
        "<td>" + statusCell + "</td>" +
        "<td><a href='" + txLink + "' target='_blank' class='tx-link'><code>" + escapeHtml(shortAddress(order.txHash)) + "</code></a><small>" + escapeHtml(order.txHash ? order.txHash.slice(0, 20) + "..." : "-") + "</small></td>" +
      "</tr>"
    );
  }).join("");

  // 绑定状态选择器事件
  if (state.isAdmin) {
    ui.ordersTableBody.querySelectorAll("[data-order-status]").forEach((element) => {
      element.addEventListener("change", (event) => {
        const orderId = event.target.getAttribute("data-order-status");
        updateOrder(orderId, {
          status: event.target.value,
          updatedAt: new Date().toISOString()
        });
      });
    });
  }
}

function exportOrders(format = "csv") {
  const orders = getVisibleOrders();
  if (!orders.length) {
    setOrderStatus("没有可导出的订单。", "warn");
    return;
  }

  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    // 导出 JSON
    const blob = new Blob([JSON.stringify(orders, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "asset-mall-orders-" + timestamp + ".json";
    anchor.click();
    URL.revokeObjectURL(url);
    setOrderStatus("JSON 订单导出成功。", "ok");
  } else {
    // 导出 CSV (Excel 兼容)
    const headers = [
      "订单号",
      "创建时间",
      "更新时间",
      "状态",
      "钱包地址",
      "姓名",
      "电话",
      "地址",
      "备注",
      "推荐人",
      "USDT金额",
      "奖励池金额",
      "资产奖励",
      "最低奖励",
      "交易哈希"
    ];

    const rows = orders.map(order => {
      const statusMap = {
        pending: "待处理",
        confirmed: "已确认",
        failed: "失败"
      };

      return [
        order.orderNo || "",
        order.createdAt ? new Date(order.createdAt).toLocaleString("zh-CN") : "",
        order.updatedAt ? new Date(order.updatedAt).toLocaleString("zh-CN") : "",
        statusMap[order.status] || order.status || "",
        order.wallet || "",
        order.name || "",
        order.phone || "",
        order.address || "",
        order.note || "",
        order.referrer || "",
        formatUnits(order.usdtAmount, state.usdtDecimals, 6),
        formatUnits(order.rewardPoolAmount, state.usdtDecimals, 6),
        formatUnits(order.assetAmount, state.assetDecimals, 6),
        formatUnits(order.minAssetAmount, state.assetDecimals, 6),
        order.txHash || ""
      ];
    });

    // 添加 BOM 以支持中文
    const BOM = "\uFEFF";

    // CSV 内容
    const csvContent = BOM + [
      headers.join(","),
      ...rows.map(row =>
        row.map(cell => {
          // 处理包含逗号或引号的单元格
          const cellStr = String(cell || "");
          if (cellStr.includes(",") || cellStr.includes('"') || cellStr.includes("\n")) {
            return '"' + cellStr.replace(/"/g, '""') + '"';
          }
          return cellStr;
        }).join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "asset-mall-orders-" + timestamp + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setOrderStatus("CSV 订单导出成功（可用 Excel 打开）。", "ok");
  }
}

// ============================================
// 区块链交互
// ============================================

async function loadContracts() {
  // 初始化 provider
  state.provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl, CONFIG.chainId);

  // 初始化合约
  state.revenueShare = new ethers.Contract(CONFIG.revenueShare, REVENUE_SHARE_ABI, state.provider);
  state.rewarder = new ethers.Contract(CONFIG.rewarder, REWARDER_ABI, state.provider);

  // 获取代币地址
  state.usdtAddress = await state.revenueShare.usdt();
  state.assetAddress = await state.rewarder.assetToken();

  // 初始化代币合约
  state.usdt = new ethers.Contract(state.usdtAddress, ERC20_ABI, state.provider);
  state.asset = new ethers.Contract(state.assetAddress, ERC20_ABI, state.provider);

  // 获取合约信息
  const [
    adminAddress,
    usdtSymbol,
    usdtDecimals,
    assetSymbol,
    assetDecimals,
    productCostBps,
    rewardBps,
    assetSourceWallet
  ] = await Promise.all([
    state.revenueShare.owner().catch(() => ethers.ZeroAddress),
    state.usdt.symbol().catch(() => "USDT"),
    state.usdt.decimals().catch(() => 18),
    state.asset.symbol().catch(() => "ASSET"),
    state.asset.decimals().catch(() => 18),
    state.revenueShare.productCostBps().catch(() => 0n),
    state.revenueShare.rewardBps().catch(() => 0n),
    state.rewarder.assetSourceWallet().catch(() => ethers.ZeroAddress)
  ]);

  state.adminAddress = adminAddress;
  state.usdtSymbol = usdtSymbol;
  state.usdtDecimals = Number(usdtDecimals);
  state.assetSymbol = assetSymbol;
  state.assetDecimals = Number(assetDecimals);
  state.productCostBps = productCostBps;
  state.rewardBps = rewardBps;

  // 更新 UI
  ui.revenueShareAddress.textContent = CONFIG.revenueShare;
  ui.rewarderAddress.textContent = CONFIG.rewarder;
  ui.oracleAddress.textContent = CONFIG.oracle;
  ui.usdtTokenAddress.textContent = state.usdtAddress;
  ui.assetTokenAddress.textContent = state.assetAddress;
  ui.assetSourceWallet.textContent = assetSourceWallet;
  ui.productCostBps.textContent = formatPercentFromBps(productCostBps);
  ui.rewardBps.textContent = formatPercentFromBps(rewardBps);

  renderOrders();
}

async function connectWallet() {
  if (!window.ethereum) {
    setStatus("未检测到钱包。请安装 MetaMask 或其他 EVM 钱包。", "error");
    return;
  }

  try {
    state.browserProvider = new ethers.BrowserProvider(window.ethereum, "any");
    await state.browserProvider.send("eth_requestAccounts", []);
    state.signer = await state.browserProvider.getSigner();
    const network = await state.browserProvider.getNetwork();

    state.account = await state.signer.getAddress();
    state.chainId = Number(network.chainId);
    // 检查是否为管理员（合约所有者或配置的管理员列表中）
    const isContractOwner = state.adminAddress !== ethers.ZeroAddress &&
                            state.account.toLowerCase() === state.adminAddress.toLowerCase();
    const isConfigAdmin = CONFIG.adminWallets.some(
      addr => addr.toLowerCase() === state.account.toLowerCase()
    );
    state.isAdmin = isContractOwner || isConfigAdmin;

    ui.walletAddress.textContent = shortAddress(state.account);
    ui.networkName.textContent = state.chainId === CONFIG.chainId ? CONFIG.chainName : "Chain ID " + state.chainId;

    // 获取绑定的推荐人
    state.boundReferrer = await state.revenueShare.referrerOf(state.account);
    ui.boundReferrer.textContent = state.boundReferrer === ethers.ZeroAddress ? "-" : shortAddress(state.boundReferrer);

    await refreshWalletMetrics();
    await refreshPreview();
    renderOrders();

    setStatus("钱包连接成功。", "ok");
  } catch (error) {
    console.error(error);
    setStatus("连接钱包失败: " + extractError(error), "error");
  }
}

async function switchToBsc() {
  if (!window.ethereum) {
    setStatus("需要钱包才能切换网络。", "error");
    return;
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CONFIG.chainIdHex }]
    });
    setStatus("已请求切换到 BSC 网络。", "ok");
  } catch (error) {
    if (error.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: CONFIG.chainIdHex,
            chainName: CONFIG.chainName,
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: [CONFIG.rpcUrl],
            blockExplorerUrls: [CONFIG.blockExplorer]
          }]
        });
        setStatus("已请求添加 BSC 网络。", "ok");
      } catch (addError) {
        setStatus("添加网络失败: " + extractError(addError), "error");
      }
    } else {
      setStatus("切换网络失败: " + extractError(error), "error");
    }
  }
}

async function refreshWalletMetrics() {
  if (!state.account) {
    ui.usdtBalance.textContent = "-";
    ui.usdtAllowance.textContent = "-";
    return;
  }

  try {
    const [balance, allowance] = await Promise.all([
      state.usdt.balanceOf(state.account),
      state.usdt.allowance(state.account, CONFIG.revenueShare)
    ]);

    ui.usdtBalance.textContent = formatUnits(balance, state.usdtDecimals) + " " + state.usdtSymbol;
    ui.usdtAllowance.textContent = formatUnits(allowance, state.usdtDecimals) + " " + state.usdtSymbol;
  } catch (error) {
    console.error("刷新钱包指标失败:", error);
  }
}

function getQueryReferrer() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  return ref && ethers.isAddress(ref) ? ethers.getAddress(ref) : "";
}

function getActiveReferrer() {
  const inputRef = ui.referrerInput.value.trim();
  if (state.boundReferrer && state.boundReferrer !== ethers.ZeroAddress) {
    return state.boundReferrer;
  }
  if (inputRef && ethers.isAddress(inputRef)) {
    return ethers.getAddress(inputRef);
  }
  return ethers.ZeroAddress;
}

function computeMinimumReward(estimatedReward) {
  const slip = Number(ui.slippageInput.value || "1");
  const safeSlip = Math.min(Math.max(slip, 0), 50);
  const bps = BigInt(Math.round(safeSlip * 100));
  return estimatedReward * (10000n - bps) / 10000n;
}

async function refreshPreview() {
  try {
    const rawAmount = ui.amountInput.value.trim();
    if (!rawAmount || Number(rawAmount) <= 0) {
      resetPreview();
      return;
    }

    const usdtAmount = parseAmount(rawAmount, state.usdtDecimals);
    if (usdtAmount === 0n) {
      resetPreview();
      return;
    }

    // 计算分配
    const directAmount = usdtAmount * 1000n / 10000n;
    const indirectAmount = usdtAmount * 500n / 10000n;
    const feeAmount = usdtAmount * 500n / 10000n;
    const productCostAmount = usdtAmount * state.productCostBps / 10000n;
    const rewardPoolAmount = usdtAmount - directAmount - indirectAmount - feeAmount - productCostAmount;

    // 获取预估奖励
    let previewReward = 0n;
    try {
      previewReward = await state.rewarder.previewReward(rewardPoolAmount);
    } catch (e) {
      console.warn("预览奖励失败:", e);
    }

    const minimumReward = computeMinimumReward(previewReward);

    state.lastPreviewReward = previewReward;

    // 更新 UI
    ui.directAmount.textContent = formatUnits(directAmount, state.usdtDecimals) + " " + state.usdtSymbol;
    ui.indirectAmount.textContent = formatUnits(indirectAmount, state.usdtDecimals) + " " + state.usdtSymbol;
    ui.feeAmount.textContent = formatUnits(feeAmount, state.usdtDecimals) + " " + state.usdtSymbol;
    ui.costAmount.textContent = formatUnits(productCostAmount, state.usdtDecimals) + " " + state.usdtSymbol;
    ui.rewardPoolAmount.textContent = formatUnits(rewardPoolAmount, state.usdtDecimals) + " " + state.usdtSymbol;
    ui.estimatedReward.textContent = formatUnits(previewReward, state.assetDecimals) + " " + state.assetSymbol;
    ui.minimumReward.textContent = formatUnits(minimumReward, state.assetDecimals) + " " + state.assetSymbol;

    // 更新绑定推荐人显示
    if (state.account) {
      try {
        state.boundReferrer = await state.revenueShare.referrerOf(state.account);
        ui.boundReferrer.textContent = state.boundReferrer === ethers.ZeroAddress ? "-" : shortAddress(state.boundReferrer);
      } catch (e) {
        // 忽略错误
      }
    }

    const activeReferrer = getActiveReferrer();
    const note = activeReferrer === ethers.ZeroAddress
      ? "未检测到有效推荐人。可能使用默认推荐钱包。"
      : "当前推荐人: " + shortAddress(activeReferrer);
    setStatus("报价已刷新。\n" + note, "ok");
  } catch (error) {
    console.error(error);
    setStatus("刷新报价失败: " + extractError(error), "error");
  }
}

function resetPreview() {
  ui.directAmount.textContent = "-";
  ui.indirectAmount.textContent = "-";
  ui.feeAmount.textContent = "-";
  ui.costAmount.textContent = "-";
  ui.rewardPoolAmount.textContent = "-";
  ui.estimatedReward.textContent = "-";
  ui.minimumReward.textContent = "-";
  state.lastPreviewReward = 0n;
}

async function approveUsdt() {
  try {
    ensureConnected();
    await ensureBsc();

    const signerUsdt = state.usdt.connect(state.signer);
    setStatus("正在发送 USDT 授权交易...", "warn");

    const tx = await signerUsdt.approve(CONFIG.revenueShare, ethers.MaxUint256);
    setStatus("授权交易已发送: " + shortAddress(tx.hash) + "\n等待确认...", "warn");

    await tx.wait();
    await refreshWalletMetrics();
    setStatus("USDT 授权已确认。", "ok");
  } catch (error) {
    console.error(error);
    setStatus("授权失败: " + extractError(error), "error");
  }
}

async function buyNow() {
  let pendingOrder = null;
  try {
    ensureConnected();
    await ensureBsc();

    const rawAmount = ui.amountInput.value.trim();
    if (!rawAmount || Number(rawAmount) <= 0) {
      throw new Error("请输入有效的 USDT 金额。");
    }

    const customer = validateCustomerInfo();
    await refreshPreview();

    const usdtAmount = parseAmount(rawAmount, state.usdtDecimals);
    const referrer = getActiveReferrer();
    const minAssetAmount = computeMinimumReward(state.lastPreviewReward);

    // 计算分配
    const directAmount = usdtAmount * 1000n / 10000n;
    const indirectAmount = usdtAmount * 500n / 10000n;
    const feeAmount = usdtAmount * 500n / 10000n;
    const productCostAmount = usdtAmount * state.productCostBps / 10000n;
    const rewardPoolAmount = usdtAmount - directAmount - indirectAmount - feeAmount - productCostAmount;

    // 检查授权额度
    const allowance = await state.usdt.allowance(state.account, CONFIG.revenueShare);
    if (allowance < usdtAmount) {
      throw new Error("USDT 授权额度不足，请先授权。");
    }

    // 发送购买交易
    const signerRevenueShare = state.revenueShare.connect(state.signer);
    setStatus("正在发送购买交易...", "warn");

    const tx = await signerRevenueShare.purchase(usdtAmount, referrer, minAssetAmount);

    // 创建待处理订单
    pendingOrder = {
      id: generateUUID(),
      orderNo: createOrderNumber(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "pending",
      wallet: state.account,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      note: customer.note,
      referrer,
      usdtAmount: usdtAmount.toString(),
      rewardPoolAmount: rewardPoolAmount.toString(),
      assetAmount: state.lastPreviewReward.toString(),
      minAssetAmount: minAssetAmount.toString(),
      txHash: tx.hash
    };
    upsertOrder(pendingOrder);

    setStatus("购买交易已发送: " + shortAddress(tx.hash) + "\n等待确认...", "warn");
    await tx.wait();

    updateOrder(pendingOrder.id, {
      status: "confirmed",
      updatedAt: new Date().toISOString()
    });

    await refreshWalletMetrics();
    await refreshPreview();
    setStatus("购买已成功确认！", "ok");
  } catch (error) {
    console.error(error);
    if (pendingOrder) {
      updateOrder(pendingOrder.id, {
        status: "failed",
        updatedAt: new Date().toISOString(),
        errorMessage: extractError(error)
      });
    }
    setStatus("购买失败: " + extractError(error), "error");
  }
}

async function copyReferralLink() {
  try {
    ensureConnected();
    const baseUrl = window.location.origin + window.location.pathname;
    const link = baseUrl + "?ref=" + state.account;
    await navigator.clipboard.writeText(link);
    setStatus("推荐链接已复制:\n" + link, "ok");
  } catch (error) {
    console.error(error);
    setStatus("复制链接失败: " + extractError(error), "error");
  }
}

function ensureConnected() {
  if (!state.signer || !state.account) {
    throw new Error("请先连接钱包。");
  }
}

async function ensureBsc() {
  const network = await state.browserProvider.getNetwork();
  if (Number(network.chainId) !== CONFIG.chainId) {
    throw new Error("请将钱包切换到 BSC 主网。");
  }
}

async function handleAccountsChanged(accounts) {
  if (!accounts.length) {
    state.signer = null;
    state.account = null;
    state.chainId = null;
    state.isAdmin = false;
    ui.walletAddress.textContent = "未连接";
    ui.networkName.textContent = "已断开";
    ui.boundReferrer.textContent = "-";
    await refreshWalletMetrics();
    resetPreview();
    renderOrders();
    setStatus("钱包已断开。", "warn");
    return;
  }
  await connectWallet();
}

async function handleChainChanged() {
  if (state.browserProvider && state.signer) {
    await connectWallet();
  }
}

// ============================================
// 初始化
// ============================================

function initUI() {
  // 获取所有 UI 元素
  const ids = [
    "connectBtn", "switchBtn", "copyRefLinkBtn", "previewBtn", "approveBtn", "buyBtn",
    "amountInput", "slippageInput", "referrerInput",
    "customerNameInput", "customerPhoneInput", "customerAddressInput", "customerNoteInput",
    "statusBox", "orderStatusBox", "walletAddress", "networkName", "boundReferrer",
    "directAmount", "indirectAmount", "feeAmount", "costAmount", "rewardPoolAmount",
    "estimatedReward", "minimumReward", "usdtBalance", "usdtAllowance",
    "productCostBps", "rewardBps", "usdtTokenAddress", "assetTokenAddress", "assetSourceWallet",
    "ordersVisibleCount", "ordersConfirmedCount", "ordersUsdtTotal", "adminStatus",
    "orderSearchInput", "orderStatusFilter", "refreshOrdersBtn", "exportCsvBtn", "exportJsonBtn", "ordersTableBody",
    "revenueShareAddress", "rewarderAddress", "oracleAddress"
  ];

  ids.forEach(id => {
    ui[id] = document.getElementById(id);
  });
}

async function init() {
  try {
    initUI();

    // 检查 URL 参数中的推荐人
    const queryReferrer = getQueryReferrer();
    if (queryReferrer) {
      ui.referrerInput.value = queryReferrer;
    }

    // 加载合约
    await loadContracts();

    // 监听钱包事件
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);
    }

    // 绑定事件处理器
    ui.previewBtn.addEventListener("click", refreshPreview);
    ui.approveBtn.addEventListener("click", approveUsdt);
    ui.buyBtn.addEventListener("click", buyNow);
    ui.refreshOrdersBtn.addEventListener("click", renderOrders);
    ui.exportCsvBtn.addEventListener("click", () => exportOrders("csv"));
    ui.exportJsonBtn.addEventListener("click", () => exportOrders("json"));
    ui.connectBtn.addEventListener("click", connectWallet);
    ui.switchBtn.addEventListener("click", switchToBsc);
    ui.copyRefLinkBtn.addEventListener("click", copyReferralLink);

    // 输入监听
    ui.amountInput.addEventListener("input", refreshPreview);
    ui.referrerInput.addEventListener("input", refreshPreview);
    ui.slippageInput.addEventListener("input", refreshPreview);
    ui.orderSearchInput.addEventListener("input", renderOrders);
    ui.orderStatusFilter.addEventListener("change", renderOrders);

    // 设置初始状态
    ui.networkName.textContent = CONFIG.chainName;
    renderOrders();
    setStatus("前端已加载。请连接钱包以继续。", "ok");
  } catch (error) {
    console.error("初始化失败:", error);
    setStatus("初始化失败: " + extractError(error), "error");
  }
}

// 启动应用
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
