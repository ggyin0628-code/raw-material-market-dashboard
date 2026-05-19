# 原物料行情查詢系統

本系統用 Node.js 伺服器抓取公開 Yahoo Finance 商品期貨行情，再由前端自動更新顯示。可以本機執行，也可以部署成公開網站。

## 公開網站部署

要讓任何地方都能開啟，請部署成 Web Service。部署說明看：

[DEPLOY.md](./DEPLOY.md)

已包含：

- `package.json`
- `render.yaml`
- `/health` 健康檢查

部署後網址會像：

```text
https://你的網站.onrender.com
```

## 啟動

最簡單方式：

```text
雙擊 start.command
```

終端機會顯示兩種網址：

- `http://localhost:4173`：只有執行這台電腦自己可以開。
- `http://你的內網IP:4173`：公司同一個網路內的其他電腦可嘗試開啟。

若要用指令啟動：

```bash
node server.js
```

本機開啟：

```text
http://localhost:4173
```

健康檢查：

```text
http://localhost:4173/health
```

## 目前資料源

- Yahoo Finance commodities / chart API
- Yahoo Finance USD/TWD 匯率

## 重要限制

公開商品期貨行情只適合採購趨勢參考，不等於台灣供應商現貨報價、含稅含運價格或合約價。若資料源失敗，畫面會標示 `API_ERROR`，不會自動改用假資料。

如果公司其他電腦打不開，常見原因是：

- 啟動服務的電腦沒有開著，或 `start.command` 沒有在跑。
- 對方電腦用了 `localhost`，但 `localhost` 只代表對方自己的電腦。
- 公司防火牆擋住 `4173` port。
- 兩台電腦不在同一個公司網段。
- 公司網路擋 Yahoo Finance，頁面可開但行情會顯示 `API_ERROR`。
