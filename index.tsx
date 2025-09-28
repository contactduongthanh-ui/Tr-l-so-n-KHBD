import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Tìm phần tử gốc trong HTML để gắn ứng dụng React vào
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Không tìm thấy phần tử gốc để gắn ứng dụng.");
}

// Tạo gốc React và render thành phần App
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);