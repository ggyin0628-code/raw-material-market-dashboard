# 公開網站部署方式

這個系統需要 Node.js 後端抓公開行情，所以要部署成 Web Service，不能只丟到一般靜態網頁空間。

## 推薦方式：Render

1. 把 `/Users/yaoyang/Desktop/purchase` 這個資料夾放到 GitHub repository。
2. 到 Render 建立 `New Web Service`。
3. 連接剛剛的 GitHub repository。
4. Render 會讀取 `render.yaml`，或手動填：
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/health`
5. 部署完成後，Render 會給一個公開網址，例如：

```text
https://raw-material-market-dashboard.onrender.com
```

任何地方都可以用這個網址開啟。

## 其他平台

也可以部署到 Railway、Fly.io、公司自己的 Linux/Windows Server，條件是：

- 支援 Node.js 20 以上
- 能執行 `npm start`
- 有對外開放 HTTP/HTTPS
- 伺服器本身可以連到 Yahoo Finance

## 部署後檢查

打開：

```text
https://你的網址/health
```

看到：

```json
{
  "status": "OK"
}
```

代表網站服務正常。

再打開：

```text
https://你的網址/api/materials
```

如果看到原物料資料，代表行情來源也正常。
