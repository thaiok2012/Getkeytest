// netlify/functions/getkey.js
//
// Chạy khi user vượt xong link4m và được redirect về đây kèm ?rid=<request_id>.
// Sinh 1 key mới (nếu request_id này chưa từng lấy key), lưu vào Netlify Blobs,
// và hiển thị 1 trang HTML đơn giản cho user copy key.

const crypto = require("crypto");
const { getStore, connectLambda } = require("@netlify/blobs");

function generateKey() {
  // Dạng: TTS-XXXX-XXXX-XXXX
  const part = () => crypto.randomBytes(2).toString("hex").toUpperCase();
  return `TTS-${part()}-${part()}-${part()}`;
}

function htmlPage(key, message) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Key của bạn</title>
  <style>
    body { font-family: sans-serif; background:#0f172a; color:#e2e8f0; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    .card { background:#1e293b; padding:32px 40px; border-radius:12px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,.4); }
    .key { font-size:1.4rem; font-weight:bold; letter-spacing:1px; background:#0f172a; padding:12px 20px; border-radius:8px; margin:16px 0; user-select:all; }
    button { padding:8px 16px; border:none; border-radius:6px; background:#22c55e; color:#052e16; font-weight:bold; cursor:pointer; }
    .msg { color:#f87171; }
  </style>
</head>
<body>
  <div class="card">
    ${key ? `
      <p>Key của bạn (dán vào lại tool):</p>
      <div class="key" id="keyBox">${key}</div>
      <button onclick="navigator.clipboard.writeText('${key}')">Copy Key</button>
    ` : `<p class="msg">${message || "Có lỗi xảy ra, vui lòng thử lại."}</p>`}
  </div>
</body>
</html>`;
}

exports.handler = async (event) => {
  connectLambda(event);

  const rid = event.queryStringParameters && event.queryStringParameters.rid;

  if (!rid) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: htmlPage(null, "Thiếu mã yêu cầu (rid). Vui lòng lấy link mới từ tool."),
    };
  }

  const store = getStore("keys");
  const recordKey = `req:${rid}`;

  let record;
  try {
    record = await store.get(recordKey, { type: "json" });
  } catch (e) {
    record = null;
  }

  if (record && record.key) {
    // Đã từng sinh key cho request này rồi (user F5 lại trang) -> hiện lại key cũ
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: htmlPage(record.key),
    };
  }

  // Sinh key mới, đảm bảo không trùng với key đã tồn tại (rất hiếm nhưng vẫn check)
  const newKey = generateKey();

  await store.setJSON(recordKey, {
    key: newKey,
    machine_id: null,
    created_at: new Date().toISOString(),
    used: false,
  });

  // Lưu thêm map ngược key -> request_id để verify.js tra cứu nhanh
  await store.setJSON(`key:${newKey}`, {
    request_id: rid,
    machine_id: null,
    created_at: new Date().toISOString(),
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: htmlPage(newKey),
  };
};
