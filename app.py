<!-- 
========= BACKEND Flask (Python) =========
บันทึกด้านล่างเป็น app.py แยกไฟล์จาก HTML

from flask import Flask, request
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

TOKEN = "7526008838:AAE7S_CzBtJ3aTo2VZqlWjqBC-41vplCOrM"
CHAT_ID = "5240024375"

@app.route('/upload_telegram', methods=['POST'])
def upload_telegram():
    if 'files' not in request.files:
        return "ไม่พบไฟล์", 400
    files = request.files.getlist('files')
    results = []
    for file_storage in files:
        url = f"https://api.telegram.org/bot{TOKEN}/sendDocument"
        files_data = {'document': (file_storage.filename, file_storage.stream, file_storage.mimetype)}
        data = {'chat_id': CHAT_ID, 'caption': f"ไฟล์: {file_storage.filename}"}
        resp = requests.post(url, files=files_data, data=data)
        if resp.status_code == 200 and resp.json().get("ok"):
            results.append(f"{file_storage.filename}: ส่งสำเร็จ")
        else:
            results.append(f"{file_storage.filename}: ล้มเหลว")
    return ", ".join(results)

if __name__ == '__main__':
    app.run(port=5000)
-->
