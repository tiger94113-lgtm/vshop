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
  "function revenueShareContract() view returns (address)",
  "function assetOracle() view returns (address)",
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
  lastWalletType: null,
  adminAddress: ethers.ZeroAddress,
  isAdmin: false,
  products: [],
  selectedProductId: null,
  editingProductId: null,
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
const PRODUCT_STORAGE_KEY = "assetMallProductsV1";
const ADMIN_STORAGE_KEY = "assetMallAdminsV1";

const DEFAULT_PRODUCTS = [
  {
    id: "starter-pack",
    sku: "SKU-STARTER-001",
    name: "入门体验套餐",
    tag: "新客推荐",
    price: "1",
    image: "🚀",
    description: "适合首次下单用户，快速体验商城购买和链上奖励发放流程。",
    active: true
  },
  {
    id: "growth-pack",
    sku: "SKU-GROWTH-002",
    name: "成长进阶套餐",
    tag: "热卖",
    price: "2",
    image: "💎",
    description: "适合持续参与用户，享受更高金额的奖励分账和订单跟踪服务。",
    active: true
  },
  {
    id: "premium-pack",
    sku: "SKU-PREMIUM-003",
    name: "旗舰尊享套餐",
    tag: "高端",
    price: "3",
    image: "🏆",
    description: "面向高净值用户，适合批量采购、渠道合作和私域裂变推广。",
    active: true
  }
];

const WALLET_CONFIG = {
  metamask: {
    name: "MetaMask",
    match: (provider) => !!provider?.isMetaMask && !provider?.isTrust && !provider?.isTokenPocket
  },
  trust: {
    name: "Trust Wallet",
    match: (provider) => !!provider?.isTrust || !!provider?.isTrustWallet
  },
  tokenpocket: {
    name: "TokenPocket",
    match: (provider) => !!provider?.isTokenPocket
  },
  math: {
    name: "Math Wallet",
    match: (provider) => !!provider?.isMathWallet
  },
  binance: {
    name: "Binance Wallet",
    match: (provider) => !!provider?.isBinance
  },
  okx: {
    name: "OKX Wallet",
    match: (provider) => !!provider?.isOKExWallet || !!provider?.isOkxWallet
  },
  injected: {
    name: "浏览器钱包",
    match: (provider) => !!provider
  }
};

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
  // 尝试提取各种可能的错误信息
  if (error?.info?.error?.message) return error.info.error.message;
  if (error?.error?.message) return error.error.message;
  if (error?.data?.message) return error.data.message;
  if (error?.shortMessage) return error.shortMessage;
  if (error?.reason) return error.reason;
  if (error?.message) {
    // 过滤掉常见的无用信息
    const msg = error.message;
    if (msg.includes("user rejected")) return "用户取消了交易";
    if (msg.includes("insufficient funds")) return "BNB 余额不足支付 Gas 费";
    if (msg.includes("Internal JSON-RPC error")) {
      // 尝试从 error.data 获取更多信息
      if (error.data) {
        return `合约执行失败: ${JSON.stringify(error.data)}`;
      }
      return "合约执行失败，请检查: 1) USDT 授权额度 2) 网络连接 3) 合约地址配置";
    }
    return msg;
  }
  return "未知错误";
}

// 详细的错误分析
function analyzeError(error) {
  const analysis = {
    type: "unknown",
    message: extractError(error),
    suggestion: ""
  };

  const msg = JSON.stringify(error).toLowerCase();
  const errorMessage = (error?.message || "").toLowerCase();
  const errorData = error?.data || error?.error?.data || "";

  // 检查错误数据中的 revert reason
  if (errorData && typeof errorData === 'string') {
    // 尝试解码 revert reason
    if (errorData.includes('0x08c379a0')) {
      analysis.type = "contract_revert";
      analysis.suggestion = "合约执行被回滚，可能是参数错误或合约状态问题";
    }
  }

  if (msg.includes("allowance") || msg.includes("approval")) {
    analysis.type = "allowance";
    analysis.suggestion = "请先点击'授权 USDT'按钮授权合约使用您的 USDT";
  } else if (msg.includes("insufficient funds")) {
    analysis.type = "gas";
    analysis.suggestion = "您的 BNB 余额不足，无法支付交易手续费(Gas费)";
  } else if (msg.includes("user rejected") || msg.includes("rejected")) {
    analysis.type = "rejected";
    analysis.suggestion = "您在钱包中取消了交易，如需购买请重新确认";
  } else if (msg.includes("rewarder not set") || msg.includes("rewarder")) {
    analysis.type = "contract_config";
    analysis.suggestion = "合约配置错误：奖励合约未设置，请联系管理员";
  } else if (msg.includes("referrer mismatch")) {
    analysis.type = "referrer";
    analysis.suggestion = "推荐人地址不匹配，请使用最初绑定的推荐人";
  } else if (msg.includes("amount is zero")) {
    analysis.type = "amount";
    analysis.suggestion = "USDT 金额必须大于 0";
  } else if (msg.includes("circular referral")) {
    analysis.type = "referrer";
    analysis.suggestion = "不能设置循环推荐关系";
  } else if (msg.includes("self referral")) {
    analysis.type = "referrer";
    analysis.suggestion = "不能将自己设为推荐人";
  } else if (msg.includes("asset amount below minimum")) {
    analysis.type = "slippage";
    analysis.suggestion = "滑点保护触发：实际奖励低于最低预期，请增加滑点容忍度或减少购买金额";
  } else if (msg.includes("unauthorized caller")) {
    analysis.type = "rewarder_config";
    analysis.suggestion = "奖励金库未绑定当前 RevenueShare 合约，请管理员检查 Rewarder 的 revenueShareContract 配置";
  } else if (msg.includes("奖励池授权不足")) {
    analysis.type = "asset_allowance";
    analysis.suggestion = "请管理员使用资产钱包，对 Rewarder 合约执行足额 approve 授权";
  } else if (msg.includes("execution reverted")) {
    analysis.type = "revert";
    analysis.suggestion = "合约执行被回滚，请检查参数是否正确";
  } else if (errorMessage.includes("internal json-rpc error")) {
    analysis.type = "rpc_error";
    analysis.suggestion = "可能的原因：\n1. 输入的 USDT 金额超过余额\n2. 合约地址配置错误\n3. 网络连接不稳定\n4. 合约已被暂停或出现故障\n\n请检查输入金额和合约配置";
  } else if (msg.includes("erc20 call failed") || msg.includes("erc20")) {
    analysis.type = "erc20_error";
    analysis.suggestion = "USDT 合约调用失败，可能原因：\n1. USDT 合约地址配置错误\n2. 您没有足够的 USDT 余额\n3. USDT 授权额度不足\n4. 合约已被暂停\n\n请检查：\n- 合约配置中的 USDT 地址是否正确\n- 您的钱包中是否有足够的 USDT\n- 是否已点击'授权 USDT'按钮";
  }

  return analysis;
}

function getExplorerLink(hash, type = "tx") {
  if (!hash || hash === "-") return "#";
  return `${CONFIG.blockExplorer}/${type}/${hash}`;
}

function isFileProtocol() {
  return window.location.protocol === "file:";
}

function getBaseUrl() {
  if (isFileProtocol()) {
    return window.location.href.split("?")[0].split("#")[0];
  }
  return window.location.origin + window.location.pathname;
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

function normalizeProduct(raw, index = 0) {
  return {
    id: raw?.id || generateUUID(),
    sku: raw?.sku || "SKU-" + String(index + 1).padStart(3, "0"),
    name: raw?.name || "未命名商品",
    tag: raw?.tag || "商品",
    price: String(raw?.price || "0"),
    image: raw?.image || "🛍️",
    description: raw?.description || "",
    active: raw?.active !== false
  };
}

function loadStoredProducts() {
  try {
    const raw = window.localStorage.getItem(PRODUCT_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(DEFAULT_PRODUCTS));
      return DEFAULT_PRODUCTS.map(normalizeProduct);
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) {
      window.localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(DEFAULT_PRODUCTS));
      return DEFAULT_PRODUCTS.map(normalizeProduct);
    }
    return parsed.map(normalizeProduct);
  } catch (error) {
    console.error("加载商品失败:", error);
    return DEFAULT_PRODUCTS.map(normalizeProduct);
  }
}

function saveStoredProducts(products) {
  const normalized = products.map(normalizeProduct);
  state.products = normalized;
  window.localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(normalized));
}

// 管理员地址管理
function loadStoredAdmins() {
  try {
    const raw = window.localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(addr => ethers.isAddress(addr));
  } catch (error) {
    console.error("加载管理员列表失败:", error);
    return [];
  }
}

function saveStoredAdmins(admins) {
  const validAdmins = admins.filter(addr => ethers.isAddress(addr));
  window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(validAdmins));
}

function addAdmin(address) {
  if (!ethers.isAddress(address)) {
    throw new Error("无效的钱包地址");
  }
  const normalized = ethers.getAddress(address);
  const admins = loadStoredAdmins();
  if (admins.some(addr => addr.toLowerCase() === normalized.toLowerCase())) {
    throw new Error("该地址已经是管理员");
  }
  admins.push(normalized);
  saveStoredAdmins(admins);
  return normalized;
}

function removeAdmin(address) {
  const normalized = ethers.getAddress(address);
  let admins = loadStoredAdmins();
  admins = admins.filter(addr => addr.toLowerCase() !== normalized.toLowerCase());
  saveStoredAdmins(admins);
}

function getAllAdmins() {
  const stored = loadStoredAdmins();
  const config = CONFIG.adminWallets || [];
  return [...new Set([...stored, ...config])];
}

function renderAdminList() {
  const listEl = document.getElementById("adminList");
  const statusEl = document.getElementById("adminManageStatus");
  if (!listEl) return;

  const admins = getAllAdmins();
  const configAdmins = CONFIG.adminWallets || [];

  if (admins.length === 0) {
    listEl.innerHTML = '<div class="muted">暂无额外管理员，请添加。</div>';
    return;
  }

  listEl.innerHTML = admins.map((addr, index) => {
    const isConfig = configAdmins.some(a => a.toLowerCase() === addr.toLowerCase());
    const isCurrentUser = state.account && addr.toLowerCase() === state.account.toLowerCase();
    const label = isCurrentUser ? " (当前用户)" : "";
    const source = isConfig ? "<span style='color: var(--accent); font-size: 11px;'>[配置文件]</span>" : "<span style='color: var(--accent-2); font-size: 11px;'>[手动添加]</span>";
    const removeBtn = isConfig ? "" : `<button class="ghost" data-remove-admin="${addr}" style="padding: 6px 10px; font-size: 12px;">移除</button>`;

    return `
      <div class="admin-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 10px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
          <code style="font-size: 13px; overflow: hidden; text-overflow: ellipsis;">${shortAddress(addr)}${label}</code>
          ${source}
        </div>
        ${removeBtn}
      </div>
    `;
  }).join("");

  // 绑定移除按钮事件
  listEl.querySelectorAll("[data-remove-admin]").forEach(btn => {
    btn.addEventListener("click", () => {
      const addr = btn.getAttribute("data-remove-admin");
      if (confirm(`确定移除管理员 ${shortAddress(addr)} 吗？`)) {
        removeAdmin(addr);
        renderAdminList();
        if (statusEl) {
          statusEl.textContent = "管理员已移除。";
          statusEl.className = "status ok";
        }
      }
    });
  });
}

function getActiveProducts() {
  return state.products.filter((product) => product.active !== false);
}

function getSelectedProduct() {
  return state.products.find((product) => product.id === state.selectedProductId) || null;
}

function fillAmountFromSelectedProduct() {
  const product = getSelectedProduct();
  if (!product) {
    ui.amountInput.value = "";
    ui.amountInput.readOnly = false;
    return;
  }
  ui.amountInput.value = product.price;
  ui.amountInput.readOnly = true;
}

function updateSelectedProductSummary() {
  const product = getSelectedProduct();
  if (!product) {
    ui.selectedProductName.textContent = "暂未选择商品";
    ui.selectedProductTag.textContent = "未选择";
    ui.selectedProductDesc.textContent = "请先在上方商品区选择一个商品，系统将自动填入价格。";
    ui.selectedProductPrice.textContent = "-";
    ui.selectedProductSku.textContent = "-";
    return;
  }

  ui.selectedProductName.textContent = product.name;
  ui.selectedProductTag.textContent = product.tag || "商品";
  ui.selectedProductDesc.textContent = product.description || "暂无商品说明。";
  ui.selectedProductPrice.textContent = product.price + " " + state.usdtSymbol;
  ui.selectedProductSku.textContent = product.sku || "-";
}

function setSelectedProduct(productId, shouldRefresh = true) {
  const product = state.products.find((item) => item.id === productId && item.active !== false);
  if (!product) return;
  state.selectedProductId = product.id;
  fillAmountFromSelectedProduct();
  updateSelectedProductSummary();
  renderProducts();
  if (shouldRefresh) {
    refreshPreview();
  }
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
      order.productName,
      order.productSku,
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
        "<td><strong>" + escapeHtml(order.orderNo) + "</strong><small>" + escapeHtml(formatDateTime(order.createdAt)) + "<br>商品: " + escapeHtml(order.productName || "-") + "</small></td>" +
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

function exportOrders(format = "csv", scope = "visible") {
  if (scope === "all" && !state.isAdmin) {
    setOrderStatus("只有管理员可以导出全部订单。", "error");
    return;
  }

  const orders = scope === "all" ? loadStoredOrders() : getVisibleOrders();
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
    anchor.download = (scope === "all" ? "asset-mall-all-orders-" : "asset-mall-orders-") + timestamp + ".json";
    anchor.click();
    URL.revokeObjectURL(url);
    setOrderStatus(scope === "all" ? "全部订单 JSON 导出成功。" : "当前可见订单 JSON 导出成功。", "ok");
  } else {
    // 导出 CSV (Excel 兼容)
    const headers = [
      "订单号",
      "创建时间",
      "更新时间",
      "状态",
      "商品名称",
      "商品SKU",
      "商品定价",
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
        order.productName || "",
        order.productSku || "",
        order.productPrice || "",
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
    anchor.download = (scope === "all" ? "asset-mall-all-orders-" : "asset-mall-orders-") + timestamp + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setOrderStatus(scope === "all" ? "全部订单 CSV 导出成功（可用 Excel 打开）。" : "当前可见订单 CSV 导出成功（可用 Excel 打开）。", "ok");
  }
}

function renderProducts() {
  if (!ui.productGrid) return;

  const activeProducts = getActiveProducts();
  if (!activeProducts.length) {
    ui.productGrid.innerHTML = '<div class="muted">暂无可售商品，请管理员先创建商品。</div>';
    state.selectedProductId = null;
    fillAmountFromSelectedProduct();
    updateSelectedProductSummary();
    return;
  }

  if (!state.selectedProductId || !activeProducts.some((product) => product.id === state.selectedProductId)) {
    state.selectedProductId = activeProducts[0].id;
  }

  ui.productGrid.innerHTML = activeProducts.map((product) => {
    const imageHtml = /^https?:\/\//i.test(product.image)
      ? '<img src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.name) + '">'
      : escapeHtml(product.image || "🛍️");

    return (
      '<article class="product-card' + (product.id === state.selectedProductId ? ' active' : '') + '">' +
        '<div class="product-cover">' + imageHtml + '</div>' +
        '<span class="product-tag">' + escapeHtml(product.tag || "商品") + '</span>' +
        '<h3>' + escapeHtml(product.name) + '</h3>' +
        '<p>' + escapeHtml(product.description || "暂无商品说明。") + '</p>' +
        '<div class="product-meta">' +
          '<div class="product-price"><span>售价</span><strong>' + escapeHtml(product.price) + ' ' + escapeHtml(state.usdtSymbol) + '</strong></div>' +
          '<button class="' + (product.id === state.selectedProductId ? 'primary' : 'ghost') + ' product-select-btn" data-select-product="' + escapeHtml(product.id) + '">' +
            (product.id === state.selectedProductId ? "已选择" : "选择商品") +
          '</button>' +
        '</div>' +
      '</article>'
    );
  }).join("");

  ui.productGrid.querySelectorAll("[data-select-product]").forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedProduct(button.getAttribute("data-select-product"));
      const current = getSelectedProduct();
      setStatus(current ? "已选择商品: " + current.name : "商品已切换。", "ok");
    });
  });

  fillAmountFromSelectedProduct();
  updateSelectedProductSummary();
}

function resetProductForm() {
  state.editingProductId = null;
  if (!ui.productNameInput) return;
  ui.productNameInput.value = "";
  ui.productPriceInput.value = "";
  ui.productTagInput.value = "";
  ui.productImageInput.value = "";
  ui.productDescriptionInput.value = "";
  ui.saveProductBtn.textContent = "保存商品";
}

function collectProductForm() {
  return {
    name: ui.productNameInput.value.trim(),
    price: ui.productPriceInput.value.trim(),
    tag: ui.productTagInput.value.trim(),
    image: ui.productImageInput.value.trim() || "🛍️",
    description: ui.productDescriptionInput.value.trim()
  };
}

function validateProductForm() {
  const form = collectProductForm();
  if (!state.isAdmin) {
    throw new Error("只有管理员可以管理商品。");
  }
  if (!form.name) {
    throw new Error("请输入商品名称。");
  }
  if (!form.price || Number(form.price) <= 0) {
    throw new Error("请输入有效的商品价格。");
  }
  return form;
}

function renderAdminProducts() {
  if (!ui.adminProductsSection || !ui.productAdminList) return;

  if (!state.isAdmin) {
    ui.adminProductsSection.classList.add("hidden");
    ui.exportAllCsvBtn.classList.add("hidden");
    ui.exportAllJsonBtn.classList.add("hidden");
    return;
  }

  ui.adminProductsSection.classList.remove("hidden");
  ui.exportAllCsvBtn.classList.remove("hidden");
  ui.exportAllJsonBtn.classList.remove("hidden");

  // 渲染管理员列表
  renderAdminList();

  if (!state.products.length) {
    ui.productAdminList.innerHTML = '<div class="muted">暂无商品，请先新增商品。</div>';
    return;
  }

  ui.productAdminList.innerHTML = state.products.map((product) => (
    '<div class="product-admin-item">' +
      '<div>' +
        '<div class="product-tag">' + escapeHtml(product.tag || "商品") + (product.active === false ? " / 已下架" : "") + '</div>' +
        '<h3>' + escapeHtml(product.name) + '</h3>' +
        '<p>SKU: ' + escapeHtml(product.sku) + '<br>售价: ' + escapeHtml(product.price) + ' ' + escapeHtml(state.usdtSymbol) + '<br>' + escapeHtml(product.description || "暂无商品说明。") + '</p>' +
      '</div>' +
      '<div class="product-admin-actions">' +
        '<button class="ghost" data-edit-product="' + escapeHtml(product.id) + '">编辑</button>' +
        '<button class="ghost" data-select-admin-product="' + escapeHtml(product.id) + '">设为当前</button>' +
        '<button class="ghost" data-toggle-product="' + escapeHtml(product.id) + '">' + (product.active === false ? "上架" : "下架") + '</button>' +
        '<button class="ghost" data-delete-product="' + escapeHtml(product.id) + '">删除</button>' +
      '</div>' +
    '</div>'
  )).join("");

  ui.productAdminList.querySelectorAll("[data-edit-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = state.products.find((item) => item.id === button.getAttribute("data-edit-product"));
      if (!product) return;
      state.editingProductId = product.id;
      ui.productNameInput.value = product.name;
      ui.productPriceInput.value = product.price;
      ui.productTagInput.value = product.tag || "";
      ui.productImageInput.value = product.image || "";
      ui.productDescriptionInput.value = product.description || "";
      ui.saveProductBtn.textContent = "更新商品";
      ui.productStatusBox.textContent = "正在编辑商品: " + product.name;
      ui.productStatusBox.className = "status ok";
    });
  });

  ui.productAdminList.querySelectorAll("[data-select-admin-product]").forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedProduct(button.getAttribute("data-select-admin-product"));
    });
  });

  ui.productAdminList.querySelectorAll("[data-toggle-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = button.getAttribute("data-toggle-product");
      state.products = state.products.map((product) =>
        product.id === productId ? { ...product, active: product.active === false } : product
      );
      saveStoredProducts(state.products);
      renderProducts();
      renderAdminProducts();
      ui.productStatusBox.textContent = "商品状态已更新。";
      ui.productStatusBox.className = "status ok";
    });
  });

  ui.productAdminList.querySelectorAll("[data-delete-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = button.getAttribute("data-delete-product");
      const product = state.products.find((item) => item.id === productId);
      if (!product) return;
      if (!confirm("确定删除商品「" + product.name + "」吗？")) return;
      state.products = state.products.filter((item) => item.id !== productId);
      saveStoredProducts(state.products);
      if (state.selectedProductId === productId) {
        const firstActive = getActiveProducts()[0];
        state.selectedProductId = firstActive ? firstActive.id : null;
      }
      renderProducts();
      renderAdminProducts();
      resetProductForm();
      ui.productStatusBox.textContent = "商品已删除。";
      ui.productStatusBox.className = "status ok";
    });
  });
}

function saveProductFromForm() {
  try {
    const form = validateProductForm();
    if (state.editingProductId) {
      state.products = state.products.map((product) =>
        product.id === state.editingProductId ? { ...product, ...form } : product
      );
      ui.productStatusBox.textContent = "商品已更新。";
    } else {
      state.products.unshift(normalizeProduct({
        id: generateUUID(),
        sku: "SKU-" + Date.now(),
        ...form,
        active: true
      }, state.products.length));
      ui.productStatusBox.textContent = "商品已新增。";
    }

    saveStoredProducts(state.products);
    if (!state.selectedProductId) {
      state.selectedProductId = getActiveProducts()[0]?.id || null;
    }
    ui.productStatusBox.className = "status ok";
    renderProducts();
    renderAdminProducts();
    resetProductForm();
  } catch (error) {
    ui.productStatusBox.textContent = extractError(error);
    ui.productStatusBox.className = "status error";
  }
}

// ============================================
// 区块链交互
// ============================================

function getInjectedProviders() {
  const ethereum = window.ethereum;
  if (!ethereum) return [];
  if (Array.isArray(ethereum.providers) && ethereum.providers.length) {
    return ethereum.providers;
  }
  return [ethereum];
}

function resolveProvider(walletType = "injected") {
  const providers = getInjectedProviders();
  if (!providers.length) return null;

  const config = WALLET_CONFIG[walletType] || WALLET_CONFIG.injected;
  const matchedProvider = providers.find((provider) => config.match(provider));
  return matchedProvider || (walletType === "injected" ? providers[0] : null);
}

function markWalletAvailability() {
  const providers = getInjectedProviders();
  const hasInjected = providers.length > 0;

  document.querySelectorAll(".wallet-option").forEach((option) => {
    const walletType = option.getAttribute("data-wallet");
    if (walletType === "walletconnect") {
      option.classList.add("disabled");
      option.setAttribute("data-status", "暂未接入");
      return;
    }

    const available = !!resolveProvider(walletType);
    option.classList.toggle("available", available);
    option.classList.toggle("disabled", !available && hasInjected && walletType !== "injected");
    option.setAttribute("data-status", available ? "已检测" : (walletType === "injected" && hasInjected ? "可连接" : "未安装"));
  });
}

function updateWalletButtonState() {
  if (!ui.connectBtn) return;
  ui.connectBtn.textContent = state.account ? `已连接 ${shortAddress(state.account)}` : "连接钱包";
}

async function loadContracts() {
  // 初始化 provider
  state.provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl, CONFIG.chainId);

  // 初始化合约
  state.revenueShare = new ethers.Contract(CONFIG.revenueShare, REVENUE_SHARE_ABI, state.provider);
  state.rewarder = new ethers.Contract(CONFIG.rewarder, REWARDER_ABI, state.provider);

  // 获取代币地址
  state.usdtAddress = await state.revenueShare.usdt();
  state.assetAddress = await state.rewarder.assetToken();

  console.log("合约配置信息:");
  console.log("- RevenueShare 地址:", CONFIG.revenueShare);
  console.log("- Rewarder 地址:", CONFIG.rewarder);
  console.log("- Oracle 地址:", CONFIG.oracle);
  console.log("- USDT 地址 (从合约获取):", state.usdtAddress);
  console.log("- Asset 地址 (从合约获取):", state.assetAddress);

  // 检查 USDT 地址是否是 BSC 主网的 USDT
  const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
  if (state.usdtAddress.toLowerCase() !== BSC_USDT.toLowerCase()) {
    console.warn("警告: 检测到的 USDT 地址与 BSC 主网 USDT 地址不匹配!");
    console.warn("- 检测到的地址:", state.usdtAddress);
    console.warn("- BSC 主网 USDT:", BSC_USDT);
  }

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
    assetSourceWallet,
    feeWallet,
    productCostWallet,
    rewardWallet,
    defaultDirectWallet,
    defaultIndirectWallet
  ] = await Promise.all([
    state.revenueShare.owner().catch(() => ethers.ZeroAddress),
    state.usdt.symbol().catch(() => "USDT"),
    state.usdt.decimals().catch(() => 18),
    state.asset.symbol().catch(() => "ASSET"),
    state.asset.decimals().catch(() => 18),
    state.revenueShare.productCostBps().catch(() => 0n),
    state.revenueShare.rewardBps().catch(() => 0n),
    state.rewarder.assetSourceWallet().catch(() => ethers.ZeroAddress),
    state.revenueShare.feeWallet().catch(() => ethers.ZeroAddress),
    state.revenueShare.productCostWallet().catch(() => ethers.ZeroAddress),
    state.revenueShare.rewardWallet().catch(() => ethers.ZeroAddress),
    state.revenueShare.defaultDirectWallet().catch(() => ethers.ZeroAddress),
    state.revenueShare.defaultIndirectWallet().catch(() => ethers.ZeroAddress)
  ]);

  console.log("合约钱包配置:");
  console.log("- feeWallet:", feeWallet);
  console.log("- productCostWallet:", productCostWallet);
  console.log("- rewardWallet:", rewardWallet);
  console.log("- defaultDirectWallet:", defaultDirectWallet);
  console.log("- defaultIndirectWallet:", defaultIndirectWallet);
  console.log("- assetSourceWallet:", assetSourceWallet);

  state.adminAddress = adminAddress;
  state.usdtSymbol = usdtSymbol;
  state.usdtDecimals = Number(usdtDecimals);
  state.assetSymbol = assetSymbol;
  state.assetDecimals = Number(assetDecimals);
  state.productCostBps = productCostBps;
  state.rewardBps = rewardBps;
  state.products = loadStoredProducts();
  if (!state.selectedProductId) {
    state.selectedProductId = getActiveProducts()[0]?.id || null;
  }

  // 更新 UI
  ui.revenueShareAddress.textContent = CONFIG.revenueShare;
  ui.rewarderAddress.textContent = CONFIG.rewarder;
  ui.oracleAddress.textContent = CONFIG.oracle;
  ui.usdtTokenAddress.textContent = state.usdtAddress;
  ui.assetTokenAddress.textContent = state.assetAddress;
  ui.assetSourceWallet.textContent = assetSourceWallet;
  ui.productCostBps.textContent = formatPercentFromBps(productCostBps);
  ui.rewardBps.textContent = formatPercentFromBps(rewardBps);

  // 显示默认钱包地址
  const defaultDirectWalletEl = document.getElementById("defaultDirectWallet");
  const defaultIndirectWalletEl = document.getElementById("defaultIndirectWallet");
  if (defaultDirectWalletEl) defaultDirectWalletEl.textContent = defaultDirectWallet;
  if (defaultIndirectWalletEl) defaultIndirectWalletEl.textContent = defaultIndirectWallet;

  // 检查默认钱包是否为零地址
  if (defaultDirectWallet === ethers.ZeroAddress) {
    console.error("错误: defaultDirectWallet 为零地址!");
    if (defaultDirectWalletEl) defaultIndirectWalletEl.style.color = "#ff6f91";
  }
  if (defaultIndirectWallet === ethers.ZeroAddress) {
    console.error("错误: defaultIndirectWallet 为零地址!");
    if (defaultIndirectWalletEl) defaultIndirectWalletEl.style.color = "#ff6f91";
  }

  // 获取并显示奖励池余额和授权
  try {
    const assetBalance = await state.asset.balanceOf(assetSourceWallet);
    const assetSourceBalanceEl = document.getElementById("assetSourceBalance");
    if (assetSourceBalanceEl) {
      assetSourceBalanceEl.textContent = formatUnits(assetBalance, state.assetDecimals) + " " + state.assetSymbol;
    }

    // 检查奖励池对 Rewarder 合约的授权
    const assetAllowance = await state.asset.allowance(assetSourceWallet, CONFIG.rewarder);
    const assetSourceAllowanceEl = document.getElementById("assetSourceAllowance");
    if (assetSourceAllowanceEl) {
      assetSourceAllowanceEl.textContent = formatUnits(assetAllowance, state.assetDecimals) + " " + state.assetSymbol;
    }

    console.log("奖励池信息:");
    console.log("- AssetSourceWallet:", assetSourceWallet);
    console.log("- 余额:", formatUnits(assetBalance, state.assetDecimals), state.assetSymbol);
    console.log("- 对 Rewarder 合约授权:", formatUnits(assetAllowance, state.assetDecimals), state.assetSymbol);

    // 如果授权为0，显示警告
    if (assetAllowance === 0n) {
      console.warn("警告: 奖励池未授权 Rewarder 合约使用 AssetToken!");
      if (assetSourceAllowanceEl) {
        assetSourceAllowanceEl.textContent += " (未授权!)";
        assetSourceAllowanceEl.style.color = "#ff6f91";
      }
    }
  } catch (e) {
    console.warn("无法获取奖励池信息:", e);
    const assetSourceBalanceEl = document.getElementById("assetSourceBalance");
    const assetSourceAllowanceEl = document.getElementById("assetSourceAllowance");
    if (assetSourceBalanceEl) assetSourceBalanceEl.textContent = "无法读取";
    if (assetSourceAllowanceEl) assetSourceAllowanceEl.textContent = "无法读取";
  }

  renderProducts();
  renderAdminProducts();
  renderOrders();
}

// 显示钱包选择模态框
function showWalletModal() {
  if (ui.walletModal) {
    markWalletAvailability();
    ui.walletModal.classList.add("active");
  }
}

// 隐藏钱包选择模态框
function hideWalletModal() {
  if (ui.walletModal) {
    ui.walletModal.classList.remove("active");
  }
}

// 使用指定钱包连接
async function connectWithWallet(walletType) {
  hideWalletModal();

  if (walletType === "walletconnect") {
    setStatus("WalletConnect 需要额外集成。请使用浏览器插件钱包。", "warn");
    return;
  }

  const provider = resolveProvider(walletType);

  if (!provider) {
    const name = WALLET_CONFIG[walletType]?.name || "该钱包";
    setStatus(`未检测到 ${name}。请确保已安装钱包插件。`, "error");

    // 打开下载页面
    const downloadUrls = {
      metamask: "https://metamask.io/download/",
      trust: "https://trustwallet.com/browser-extension",
      tokenpocket: "https://www.tokenpocket.pro/",
      math: "https://mathwallet.org/",
      binance: "https://www.bnbchain.org/en/binance-wallet",
      okx: "https://www.okx.com/web3"
    };
    if (downloadUrls[walletType]) {
      setTimeout(() => {
        if (confirm(`是否打开 ${name} 下载页面？`)) {
          window.open(downloadUrls[walletType], "_blank");
        }
      }, 100);
    }
    return;
  }

  try {
    // 设置当前使用的 provider
    window.currentProvider = provider;
    state.lastWalletType = walletType;

    state.browserProvider = new ethers.BrowserProvider(provider, "any");
    await state.browserProvider.send("eth_requestAccounts", []);
    state.signer = await state.browserProvider.getSigner();
    const network = await state.browserProvider.getNetwork();

    state.account = await state.signer.getAddress();
    state.chainId = Number(network.chainId);

    // 检查是否为管理员
    const isContractOwner = state.adminAddress !== ethers.ZeroAddress &&
                            state.account.toLowerCase() === state.adminAddress.toLowerCase();
    const allAdmins = getAllAdmins();
    const isStoredAdmin = allAdmins.some(
      addr => addr.toLowerCase() === state.account.toLowerCase()
    );
    state.isAdmin = isContractOwner || isStoredAdmin;

    ui.walletAddress.textContent = shortAddress(state.account);
    ui.networkName.textContent = state.chainId === CONFIG.chainId ? CONFIG.chainName : "Chain ID " + state.chainId;
    updateWalletButtonState();

    // 获取绑定的推荐人
    state.boundReferrer = await state.revenueShare.referrerOf(state.account);
    ui.boundReferrer.textContent = state.boundReferrer === ethers.ZeroAddress ? "-" : shortAddress(state.boundReferrer);

    await refreshWalletMetrics();
    await refreshPreview();
    renderAdminProducts();
    renderOrders();

    // 设置事件监听
    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);

    const name = WALLET_CONFIG[walletType]?.name || "钱包";
    setStatus(`${name} 连接成功。`, "ok");
  } catch (error) {
    console.error(error);
    setStatus("连接钱包失败: " + extractError(error), "error");
  }
}

// 保持向后兼容的通用连接函数
async function connectWallet() {
  const providers = getInjectedProviders();
  if (!providers.length) {
    if (isFileProtocol()) {
      setStatus("未检测到钱包。你当前可能是直接用 file:// 打开的页面，请改用本地 HTTP 服务，或在钱包扩展里开启“允许访问文件网址”。", "error");
    } else {
      setStatus("未检测到浏览器钱包。请先安装 MetaMask、OKX Wallet、Trust Wallet 等插件。", "error");
    }
    return;
  }

  if (providers.length === 1) {
    await connectWithWallet("injected");
    return;
  }

  showWalletModal();
}

async function switchToBsc() {
  const provider = window.currentProvider || window.ethereum;
  if (!provider) {
    setStatus("需要钱包才能切换网络。", "error");
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CONFIG.chainIdHex }]
    });
    setStatus("已请求切换到 BSC 网络。", "ok");
  } catch (error) {
    if (error.code === 4902) {
      try {
        await provider.request({
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
    if (!getSelectedProduct()) {
      resetPreview();
      setStatus("请先选择一个商品。", "warn");
      return;
    }

    const rawAmount = ui.amountInput.value.trim();
    if (!rawAmount || Number(rawAmount) <= 0) {
      resetPreview();
      updateAmountCheck(null, null);
      return;
    }

    const usdtAmount = parseAmount(rawAmount, state.usdtDecimals);
    if (usdtAmount === 0n) {
      resetPreview();
      updateAmountCheck(null, null);
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

    // 更新金额检查提示
    if (state.account) {
      try {
        const balance = await state.usdt.balanceOf(state.account);
        const allowance = await state.usdt.allowance(state.account, CONFIG.revenueShare);
        updateAmountCheck(usdtAmount, balance, allowance);
      } catch (e) {
        console.warn("余额检查失败:", e);
      }
    }

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

// 更新金额检查提示
function updateAmountCheck(usdtAmount, balance, allowance) {
  const checkEl = document.getElementById("amountCheck");
  const iconEl = document.getElementById("amountCheckIcon");
  const textEl = document.getElementById("amountCheckText");

  if (!checkEl || !iconEl || !textEl) return;

  if (!usdtAmount || balance === null) {
    checkEl.style.display = "none";
    return;
  }

  checkEl.style.display = "flex";

  const balanceNum = Number(formatUnits(balance, state.usdtDecimals));
  const amountNum = Number(formatUnits(usdtAmount, state.usdtDecimals));
  const allowanceNum = allowance ? Number(formatUnits(allowance, state.usdtDecimals)) : 0;

  if (balance < usdtAmount) {
    checkEl.className = "amount-check error";
    iconEl.textContent = "❌";
    textEl.textContent = `USDT 余额不足！当前: ${balanceNum.toFixed(6)} USDT，需要: ${amountNum.toFixed(6)} USDT，差额: ${(amountNum - balanceNum).toFixed(6)} USDT`;
  } else if (allowance < usdtAmount) {
    checkEl.className = "amount-check warning";
    iconEl.textContent = "⚠️";
    textEl.textContent = `USDT 授权额度不足！当前授权: ${allowanceNum.toFixed(6)} USDT，需要: ${amountNum.toFixed(6)} USDT。请先点击"授权 USDT"按钮。`;
  } else {
    checkEl.className = "amount-check ok";
    iconEl.textContent = "✅";
    textEl.textContent = `金额检查通过！余额: ${balanceNum.toFixed(6)} USDT，授权: ${allowanceNum.toFixed(6)} USDT`;
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

    const selectedProduct = getSelectedProduct();
    if (!selectedProduct) {
      throw new Error("请先选择商品。");
    }

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

    // 详细前置检查
    setStatus("正在检查购买条件...", "warn");

    // 0. 检查合约状态
    try {
      // 尝试调用一个 view 函数来检查合约是否正常工作
      await state.revenueShare.usdt();
    } catch (contractError) {
      console.error("合约检查失败:", contractError);
      throw new Error("RevenueShare 合约无法正常访问，请检查合约地址配置是否正确。");
    }

    // 检查 USDT 合约
    try {
      await state.usdt.symbol();
      await state.usdt.decimals();
    } catch (usdtError) {
      console.error("USDT 合约检查失败:", usdtError);
      throw new Error("USDT 合约无法正常访问。可能原因：\n1. 合约地址错误\n2. 网络连接问题\n3. 该地址不是有效的 ERC20 合约");
    }

    // 检查默认钱包配置
    try {
      const [defaultDirectWallet, defaultIndirectWallet] = await Promise.all([
        state.revenueShare.defaultDirectWallet(),
        state.revenueShare.defaultIndirectWallet()
      ]);

      if (defaultDirectWallet === ethers.ZeroAddress) {
        throw new Error("合约配置错误：defaultDirectWallet 为零地址。请管理员调用 setWallets 设置正确的钱包地址。");
      }
      if (defaultIndirectWallet === ethers.ZeroAddress) {
        throw new Error("合约配置错误：defaultIndirectWallet 为零地址。请管理员调用 setWallets 设置正确的钱包地址。");
      }

      console.log("默认钱包配置:");
      console.log("- defaultDirectWallet:", defaultDirectWallet);
      console.log("- defaultIndirectWallet:", defaultIndirectWallet);
    } catch (walletError) {
      if (walletError.message.includes("合约配置错误")) {
        throw walletError;
      }
      console.warn("无法读取默认钱包配置:", walletError);
    }

    // 1. 检查 USDT 余额
    let balance;
    try {
      balance = await state.usdt.balanceOf(state.account);
    } catch (e) {
      throw new Error("无法读取 USDT 余额，请检查 USDT 合约配置。");
    }
    if (balance < usdtAmount) {
      throw new Error(`USDT 余额不足。当前余额: ${formatUnits(balance, state.usdtDecimals)} ${state.usdtSymbol}, 需要: ${formatUnits(usdtAmount, state.usdtDecimals)} ${state.usdtSymbol}`);
    }

    // 2. 检查授权额度
    let allowance;
    try {
      allowance = await state.usdt.allowance(state.account, CONFIG.revenueShare);
    } catch (e) {
      throw new Error("无法读取 USDT 授权额度，请检查合约配置。");
    }
    if (allowance < usdtAmount) {
      throw new Error(`USDT 授权额度不足。当前授权: ${formatUnits(allowance, state.usdtDecimals)} ${state.usdtSymbol}, 需要: ${formatUnits(usdtAmount, state.usdtDecimals)} ${state.usdtSymbol}。请先点击"授权 USDT"按钮。`);
    }

    // 3. 检查奖励合约是否设置
    if (!state.rewarder || !state.rewarder.target) {
      throw new Error("奖励合约未正确初始化，请刷新页面重试。");
    }

    // 3.1 检查奖励金库配置是否与前端目标合约一致
    try {
      const [configuredRevenueShare, configuredOracle] = await Promise.all([
        state.rewarder.revenueShareContract(),
        state.rewarder.assetOracle()
      ]);

      if (configuredRevenueShare.toLowerCase() !== CONFIG.revenueShare.toLowerCase()) {
        throw new Error(
          `奖励金库配置错误：当前绑定的 RevenueShare 为 ${configuredRevenueShare}，前端目标为 ${CONFIG.revenueShare}。请管理员调用 setRevenueShareContract 修正。`
        );
      }

      if (configuredOracle.toLowerCase() !== CONFIG.oracle.toLowerCase()) {
        throw new Error(
          `奖励金库配置错误：当前绑定的 Oracle 为 ${configuredOracle}，前端目标为 ${CONFIG.oracle}。请管理员调用 setAssetOracle 修正。`
        );
      }
    } catch (rewarderConfigError) {
      if (rewarderConfigError.message.includes("奖励金库配置错误")) {
        throw rewarderConfigError;
      }
      console.warn("无法完整读取奖励金库配置:", rewarderConfigError);
    }

    // 4. 检查预估奖励
    if (state.lastPreviewReward === 0n) {
      throw new Error("无法获取奖励预估，请检查网络连接或稍后重试。");
    }

    // 5. 检查 BNB 余额（用于支付 Gas）
    const bnbBalance = await state.browserProvider.getBalance(state.account);
    if (bnbBalance === 0n) {
      throw new Error("BNB 余额为 0，无法支付交易手续费。请先充值 BNB。");
    }

    // 6. 检查 AssetSourceWallet 是否有足够的 AssetToken 余额和授权来支付奖励
    try {
      const assetSourceWallet = await state.rewarder.assetSourceWallet();
      const [assetBalance, assetAllowanceToRewarder] = await Promise.all([
        state.asset.balanceOf(assetSourceWallet),
        state.asset.allowance(assetSourceWallet, CONFIG.rewarder)
      ]);
      console.log("AssetSourceWallet 信息:");
      console.log("- 地址:", assetSourceWallet);
      console.log("- AssetToken 余额:", formatUnits(assetBalance, state.assetDecimals), state.assetSymbol);
      console.log("- 对 Rewarder 授权:", formatUnits(assetAllowanceToRewarder, state.assetDecimals), state.assetSymbol);
      console.log("- 预估奖励:", formatUnits(state.lastPreviewReward, state.assetDecimals), state.assetSymbol);

      if (assetBalance < state.lastPreviewReward) {
        throw new Error(`奖励池余额不足！\nAssetSourceWallet (${shortAddress(assetSourceWallet)}) 的 ${state.assetSymbol} 余额: ${formatUnits(assetBalance, state.assetDecimals)}\n预估奖励: ${formatUnits(state.lastPreviewReward, state.assetDecimals)}\n\n请联系管理员充值奖励池。`);
      }

      if (assetAllowanceToRewarder < state.lastPreviewReward) {
        throw new Error(`奖励池授权不足！\nAssetSourceWallet (${shortAddress(assetSourceWallet)}) 对 Rewarder (${shortAddress(CONFIG.rewarder)}) 的 ${state.assetSymbol} 授权额度: ${formatUnits(assetAllowanceToRewarder, state.assetDecimals)}\n预估奖励: ${formatUnits(state.lastPreviewReward, state.assetDecimals)}\n\n请管理员用资产钱包先对 Rewarder 合约执行 approve。`);
      }
    } catch (e) {
      if (e.message.includes("奖励池余额不足") || e.message.includes("奖励池授权不足")) throw e;
      console.warn("无法检查 AssetSourceWallet 余额:", e);
    }

    // 7. 尝试预估 Gas，检查交易是否会失败
    try {
      const signerRevenueShare = state.revenueShare.connect(state.signer);
      await signerRevenueShare.purchase.estimateGas(usdtAmount, referrer, minAssetAmount);
    } catch (estimateError) {
      console.error("Gas 估算失败:", estimateError);
      const errorMsg = extractError(estimateError);

      // 尝试获取更详细的错误信息
      let detailedError = errorMsg;
      try {
        // 尝试调用 previewSplit 来获取更多信息
        const preview = await state.revenueShare.previewSplit(state.account, usdtAmount);
        console.log("previewSplit 结果:", preview);
      } catch (previewError) {
        console.error("previewSplit 也失败了:", previewError);
        detailedError += "\n\npreviewSplit 调用也失败，可能是合约状态问题。";
      }

      // 输出详细的调试信息
      console.log("=== 购买调试信息 ===");
      console.log("用户地址:", state.account);
      console.log("USDT 金额:", formatUnits(usdtAmount, state.usdtDecimals));
      console.log("推荐人地址:", referrer);
      console.log("最低奖励:", formatUnits(minAssetAmount, state.assetDecimals));
      console.log("预估奖励:", formatUnits(state.lastPreviewReward, state.assetDecimals));
      console.log("RevenueShare:", CONFIG.revenueShare);
      console.log("Rewarder:", CONFIG.rewarder);
      console.log("Oracle:", CONFIG.oracle);

      throw new Error(`交易预执行失败: ${detailedError}\n\n可能原因：\n1. 合约逻辑检查失败（如推荐人地址无效）\n2. 合约配置错误（奖励金库/Oracle 绑定不一致）\n3. 参数错误\n4. 奖励池余额不足\n5. 资产钱包未对 Rewarder 授权\n\n请打开浏览器控制台(F12)查看详细调试信息。`);
    }

    // 输出购买前的调试信息
    console.log("=== 购买交易信息 ===");
    console.log("用户地址:", state.account);
    console.log("USDT 金额:", formatUnits(usdtAmount, state.usdtDecimals));
    console.log("推荐人地址:", referrer);
    console.log("最低奖励:", formatUnits(minAssetAmount, state.assetDecimals));
    console.log("预估奖励:", formatUnits(state.lastPreviewReward, state.assetDecimals));

    // 发送购买交易
    const signerRevenueShare = state.revenueShare.connect(state.signer);
    setStatus("正在发送购买交易...\n请在钱包中确认交易", "warn");

    // 添加 gas 限制估算
    let gasLimit;
    try {
      gasLimit = await signerRevenueShare.purchase.estimateGas(usdtAmount, referrer, minAssetAmount);
      // 增加 20% 缓冲
      gasLimit = (gasLimit * 120n) / 100n;
    } catch (gasError) {
      console.warn("Gas 估算失败:", gasError);
      // 使用默认 gas 限制
      gasLimit = 500000n;
    }

    const tx = await signerRevenueShare.purchase(usdtAmount, referrer, minAssetAmount, {
      gasLimit: gasLimit
    });

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
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      productSku: selectedProduct.sku,
      productPrice: selectedProduct.price,
      referrer,
      usdtAmount: usdtAmount.toString(),
      rewardPoolAmount: rewardPoolAmount.toString(),
      assetAmount: state.lastPreviewReward.toString(),
      minAssetAmount: minAssetAmount.toString(),
      txHash: tx.hash
    };
    upsertOrder(pendingOrder);

    setStatus("购买交易已发送: " + shortAddress(tx.hash) + "\n等待确认...", "warn");
    const receipt = await tx.wait();

    // 检查交易状态
    if (receipt.status === 0) {
      throw new Error("交易执行失败（被回滚），请检查合约状态或联系管理员。");
    }

    updateOrder(pendingOrder.id, {
      status: "confirmed",
      updatedAt: new Date().toISOString(),
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    });

    await refreshWalletMetrics();
    await refreshPreview();
    setStatus("购买已成功确认！\n区块号: " + receipt.blockNumber, "ok");
  } catch (error) {
    console.error("购买失败详情:", error);

    // 详细错误分析
    const analysis = analyzeError(error);
    let errorMsg = "购买失败: " + analysis.message;
    if (analysis.suggestion) {
      errorMsg += "\n\n建议: " + analysis.suggestion;
    }

    // 记录到控制台供调试
    console.log("错误分析:", analysis);
    console.log("原始错误:", error);

    if (pendingOrder) {
      updateOrder(pendingOrder.id, {
        status: "failed",
        updatedAt: new Date().toISOString(),
        errorMessage: analysis.message,
        errorType: analysis.type
      });
    }
    setStatus(errorMsg, "error");
  }
}

async function copyReferralLink() {
  try {
    ensureConnected();
    const baseUrl = getBaseUrl();
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
    state.lastWalletType = null;
    ui.walletAddress.textContent = "未连接";
    ui.networkName.textContent = "已断开";
    ui.boundReferrer.textContent = "-";
    updateWalletButtonState();
    await refreshWalletMetrics();
    resetPreview();
    renderAdminProducts();
    renderOrders();
    setStatus("钱包已断开。", "warn");
    return;
  }
  const reconnectType = state.lastWalletType || "injected";
  await connectWithWallet(reconnectType);
}

async function handleChainChanged() {
  if (state.browserProvider && state.signer) {
    const reconnectType = state.lastWalletType || "injected";
    await connectWithWallet(reconnectType);
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
    "productGrid", "selectedProductBox", "selectedProductName", "selectedProductTag", "selectedProductDesc",
    "selectedProductPrice", "selectedProductSku", "adminProductsSection", "productAdminList", "productStatusBox",
    "productNameInput", "productPriceInput", "productTagInput", "productImageInput", "productDescriptionInput",
    "saveProductBtn", "resetProductBtn",
    "customerNameInput", "customerPhoneInput", "customerAddressInput", "customerNoteInput",
    "statusBox", "orderStatusBox", "walletAddress", "networkName", "boundReferrer",
    "directAmount", "indirectAmount", "feeAmount", "costAmount", "rewardPoolAmount",
    "estimatedReward", "minimumReward", "usdtBalance", "usdtAllowance",
    "productCostBps", "rewardBps", "usdtTokenAddress", "assetTokenAddress", "assetSourceWallet",
    "ordersVisibleCount", "ordersConfirmedCount", "ordersUsdtTotal", "adminStatus",
    "orderSearchInput", "orderStatusFilter", "refreshOrdersBtn",
    "exportVisibleCsvBtn", "exportVisibleJsonBtn", "exportAllCsvBtn", "exportAllJsonBtn", "ordersTableBody",
    "revenueShareAddress", "rewarderAddress", "oracleAddress",
    "walletModal", "closeWalletModal"
  ];

  ids.forEach(id => {
    ui[id] = document.getElementById(id);
  });
}

async function init() {
  try {
    initUI();
    markWalletAvailability();
    updateWalletButtonState();
    let initStatusMessage = "前端已加载。请连接钱包以继续。";
    let initStatusType = "ok";

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
    } else if (isFileProtocol()) {
      initStatusMessage = "当前页面是 file:// 本地文件模式。若钱包未注入，请改用本地 HTTP 服务打开，或在钱包扩展里允许访问文件网址。";
      initStatusType = "warn";
    }

    // 绑定事件处理器
    ui.previewBtn.addEventListener("click", refreshPreview);
    ui.approveBtn.addEventListener("click", approveUsdt);
    ui.buyBtn.addEventListener("click", buyNow);
    ui.refreshOrdersBtn.addEventListener("click", renderOrders);
    ui.exportVisibleCsvBtn.addEventListener("click", () => exportOrders("csv", "visible"));
    ui.exportVisibleJsonBtn.addEventListener("click", () => exportOrders("json", "visible"));
    ui.exportAllCsvBtn.addEventListener("click", () => exportOrders("csv", "all"));
    ui.exportAllJsonBtn.addEventListener("click", () => exportOrders("json", "all"));
    ui.saveProductBtn.addEventListener("click", saveProductFromForm);
    ui.resetProductBtn.addEventListener("click", resetProductForm);
    ui.connectBtn.addEventListener("click", connectWallet);
    ui.switchBtn.addEventListener("click", switchToBsc);
    ui.copyRefLinkBtn.addEventListener("click", copyReferralLink);

    // 管理员管理事件
    const addAdminBtn = document.getElementById("addAdminBtn");
    const newAdminInput = document.getElementById("newAdminAddressInput");
    const adminStatusEl = document.getElementById("adminManageStatus");

    if (addAdminBtn && newAdminInput) {
      addAdminBtn.addEventListener("click", () => {
        try {
          const address = newAdminInput.value.trim();
          if (!address) {
            if (adminStatusEl) {
              adminStatusEl.textContent = "请输入钱包地址";
              adminStatusEl.className = "status error";
            }
            return;
          }
          addAdmin(address);
          newAdminInput.value = "";
          renderAdminList();
          if (adminStatusEl) {
            adminStatusEl.textContent = "管理员添加成功！";
            adminStatusEl.className = "status ok";
          }
        } catch (error) {
          if (adminStatusEl) {
            adminStatusEl.textContent = "添加失败: " + error.message;
            adminStatusEl.className = "status error";
          }
        }
      });
    }

    // 钱包模态框事件
    ui.closeWalletModal.addEventListener("click", hideWalletModal);
    ui.walletModal.addEventListener("click", (e) => {
      if (e.target === ui.walletModal) hideWalletModal();
    });

    // 钱包选项点击事件
    document.querySelectorAll(".wallet-option").forEach(option => {
      option.addEventListener("click", () => {
        if (option.classList.contains("disabled")) {
          return;
        }
        const walletType = option.getAttribute("data-wallet");
        connectWithWallet(walletType);
      });
    });

    // 输入监听
    ui.amountInput.addEventListener("input", refreshPreview);
    ui.referrerInput.addEventListener("input", refreshPreview);
    ui.slippageInput.addEventListener("input", refreshPreview);
    ui.orderSearchInput.addEventListener("input", renderOrders);
    ui.orderStatusFilter.addEventListener("change", renderOrders);

    // 设置初始状态
    ui.networkName.textContent = CONFIG.chainName;
    renderProducts();
    renderAdminProducts();
    renderOrders();
    setStatus(initStatusMessage, initStatusType);
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
