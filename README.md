# Asset Mall - DApp 前端

一个基于 BSC 的 USDT 收益分享平台前端，支持购买资产、实时奖励、推荐机制等功能。

## 🌟 功能特性

- **钱包连接**: 支持 MetaMask 和其他 EVM 兼容钱包
- **USDT 购买**: 使用 USDT 购买资产代币
- **实时奖励**: 根据链上预言机获取实时奖励预估
- **推荐系统**: 支持两级推荐奖励机制
- **订单管理**: 本地存储订单，支持搜索、筛选和导出
- **管理员功能**: 管理员可以查看所有订单并更新状态

## 🚀 GitHub Pages 部署指南

### 1. 准备工作

确保你已经：
- 部署了智能合约到 BSC 主网
- 记录了所有合约地址

### 2. 修改配置

编辑 `app.js` 文件中的 `CONFIG` 对象，填入你的合约地址：

```javascript
const CONFIG = {
  chainIdHex: "0x38",
  chainId: 56,
  chainName: "BSC Mainnet",
  rpcUrl: "https://bsc-dataseed.binance.org",
  blockExplorer: "https://bscscan.com",

  // 修改以下地址为你的实际部署地址
  revenueShare: "0xYourRevenueShareContractAddress",
  rewarder: "0xYourRewarderContractAddress",
  oracle: "0xYourOracleContractAddress",

  // 添加额外的管理员钱包地址（可选）
  // 合约部署者自动成为管理员，这里可以添加更多管理员
  adminWallets: [
    "0xAdminWalletAddress1",
    "0xAdminWalletAddress2",
  ]
};
```

### 3. 部署到 GitHub Pages

#### 方法一：通过 GitHub 网站上传

1. 创建一个新的 GitHub 仓库
2. 上传以下文件到仓库：
   - `index.html`
   - `app.js`
   - `README.md`
3. 进入仓库的 **Settings** > **Pages**
4. 在 **Source** 部分选择 **Deploy from a branch**
5. 选择 **main** 分支和 **/(root)** 文件夹
6. 点击 **Save**
7. 等待几分钟后，你的站点将在 `https://yourusername.github.io/your-repo-name` 上线

#### 方法二：通过 Git 命令行

```bash
# 克隆仓库（或创建新仓库）
git clone https://github.com/yourusername/your-repo-name.git
cd your-repo-name

# 复制项目文件到仓库目录
cp /path/to/your/files/* .

# 提交并推送
git add .
git commit -m "Initial deployment"
git push origin main
```

### 4. 自定义域名（可选）

1. 在仓库根目录创建 `CNAME` 文件
2. 文件内容为你的域名，例如：
   ```
   mall.yourdomain.com
   ```
3. 在你的 DNS 提供商处添加 CNAME 记录指向 `yourusername.github.io`

## 📁 项目结构

```
.
├── index.html          # 主页面
├── app.js              # DApp 逻辑
├── README.md           # 项目说明
├── UsdtRevenueShareV1Realtime.sol  # 智能合约源码
└── mall-frontend.html  # 原始前端文件（参考）
```

## 🔧 技术栈

- **前端**: 纯 HTML5 + CSS3 + JavaScript
- **区块链交互**: Ethers.js v6
- **网络**: BSC Mainnet (Chain ID: 56)
- **存储**: LocalStorage（订单数据）

## 💡 使用说明

### 对于买家

1. 访问 DApp 网站
2. 点击"连接钱包"按钮连接 MetaMask
3. 输入 USDT 金额和推荐人地址（可选）
4. 填写订单信息（姓名、电话、地址）
5. 点击"授权 USDT"授权合约使用你的 USDT
6. 点击"立即购买"完成交易

### 对于推荐人

1. 连接钱包后，点击"复制推荐链接"
2. 将链接分享给好友
3. 好友通过你的链接购买，你将获得推荐奖励

### 对于管理员

1. **管理员身份**：
   - 合约部署者自动成为管理员
   - 可以在 `app.js` 的 `CONFIG.adminWallets` 中添加更多管理员地址

2. **管理功能**：
   - 查看所有用户的订单（普通用户只能看到自己的）
   - 更新订单状态（待处理/已确认/失败）
   - 导出订单数据为 CSV (Excel) 或 JSON 格式
   - 搜索和筛选订单

3. **添加管理员**：
   ```javascript
   // 在 app.js 的 CONFIG 中添加
   adminWallets: [
     "0xAdminWalletAddress1",
     "0xAdminWalletAddress2",
   ]
   ```

## 🔗 合约功能

### UsdtRevenueShareV1Realtime

- **购买**: `purchase(usdtAmount, referrer, minAssetAmount)`
- **预览分配**: `previewSplit(user, usdtAmount)`
- **绑定推荐人**: `bindReferrer(referrer)`

### 资金分配比例

- 直接推荐奖励: 10% (1000 BPS)
- 间接推荐奖励: 5% (500 BPS)
- 手续费: 5% (500 BPS)
- 产品成本: 可配置
- 奖励池: 剩余部分

## ⚠️ 注意事项

1. **订单存储**: 订单数据仅存储在浏览器本地，清除浏览器数据会丢失订单记录
2. **网络要求**: 必须使用 BSC 主网
3. **USDT 授权**: 购买前需要先授权 USDT
4. **滑点保护**: 设置合理的滑点容忍度以保护交易

## 🐛 故障排除

### 无法连接钱包
- 确保已安装 MetaMask 或其他钱包插件
- 检查浏览器是否阻止了弹窗

### 交易失败
- 确保钱包中有足够的 BNB 支付 Gas 费
- 检查 USDT 余额是否充足
- 确认已授权足够的 USDT 额度

### 订单不显示
- 订单仅存储在当前浏览器中
- 尝试刷新页面或重新连接钱包

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 联系

如有问题，请通过 GitHub Issues 联系。
