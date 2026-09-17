// netlify/functions/verify.js
//
// key.py gọi hàm này (POST) với { key, machine_id, secret } để:
//   - kiểm tra key có tồn tại không
//   - nếu key chưa gắn máy nào -> gắn machine_id này vào, trả về "ok"
//   - nếu key đã gắn đúng machine_id này -> trả về "ok" (cho phép dùng lại)
//   - nếu key đã gắn máy khác -> từ chối "device_mismatch"

const { getStore } = require("@netlify/blobs");

const APP_SECRET = process.env.APP_SECRET;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "method_not_allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "invalid_json" }) };
  }

  const { key, machine_id, secret } = body;

  if (!APP_SECRET || secret !== APP_SECRET) {
    return { statusCode: 403, body: JSON.stringify({ ok: false, error: "invalid_secret" }) };
  }

  if (!key || !machine_id) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "missing_fields" }) };
  }

  const store = getStore("keys");
  const keyRecordName = `key:${key}`;

  let record;
  try {
    record = await store.get(keyRecordName, { type: "json" });
  } catch {
    record = null;
  }

  if (!record) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: "key_not_found" }) };
  }

  if (!record.machine_id) {
    // Lần đầu dùng key này -> khoá vào máy hiện tại
    record.machine_id = machine_id;
    record.activated_at = new Date().toISOString();
    await store.setJSON(keyRecordName, record);

    // đồng bộ lại bản ghi theo request_id (để getkey.js hiện đúng trạng thái nếu cần)
    if (record.request_id) {
      const reqRecordName = `req:${record.request_id}`;
      const reqRecord = await store.get(reqRecordName, { type: "json" }).catch(() => null);
      if (reqRecord) {
        reqRecord.machine_id = machine_id;
        reqRecord.used = true;
        await store.setJSON(reqRecordName, reqRecord);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, status: "activated" }) };
  }

  if (record.machine_id === machine_id) {
    // Đúng máy đã kích hoạt trước đó -> cho phép dùng tiếp
    return { statusCode: 200, body: JSON.stringify({ ok: true, status: "valid" }) };
  }

  // Key đã bị máy khác dùng rồi
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: false, error: "device_mismatch" }),
  };
};
