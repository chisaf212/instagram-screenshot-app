import { useState, useRef } from 'react';

const DEFAULT_LIST = `https://www.instagram.com/chiro_reito_recipe/
https://www.instagram.com/emu_gohan_stock
https://www.instagram.com/mayo_zuboragohan
https://www.instagram.com/kaori_banshaku
https://www.instagram.com/an_zu_recipe
https://www.instagram.com/hina_recipe_diet`;

// URLからユーザー名を取得
function extractUsername(url) {
  try {
    return url.replace(/\/$/, '').split('/').pop();
  } catch {
    return url;
  }
}

// テキストエリアからアカウントリストを解析
// 対応フォーマット（1行1件）:
//   https://www.instagram.com/xxx
//   名前,https://www.instagram.com/xxx
//   名前 https://www.instagram.com/xxx
function parseList(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('instagram.com'))
    .slice(0, 100) // 最大100件
    .map((line) => {
      // カンマ区切り: 名前,URL
      const commaIdx = line.indexOf(',');
      if (commaIdx > 0 && !line.startsWith('http')) {
        return { name: line.slice(0, commaIdx).trim(), url: line.slice(commaIdx + 1).trim() };
      }
      // スペース区切り: 名前 URL（URLが後半）
      const spaceIdx = line.search(/https?:\/\//);
      if (spaceIdx > 0) {
        return { name: line.slice(0, spaceIdx).trim(), url: line.slice(spaceIdx).trim() };
      }
      // URLのみ → ユーザー名を自動取得
      return { name: extractUsername(line), url: line };
    });
}

const STATUS_LABEL = { idle: '待機中', loading: '撮影中...', done: '完了', error: '失敗' };
const STATUS_COLOR = { idle: '#9ca3af', loading: '#f59e0b', done: '#16a34a', error: '#dc2626' };

export default function Home() {
  const [listText, setListText] = useState(DEFAULT_LIST);
  const [statuses, setStatuses] = useState({});
  const [images, setImages] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const cancelRef = useRef(false);

  const accounts = parseList(listText);

  const setStatus = (key, status) =>
    setStatuses((prev) => ({ ...prev, [key]: status }));

  const takeScreenshots = async () => {
    cancelRef.current = false;
    setIsRunning(true);
    setIsDone(false);
    setImages([]);
    setStatuses({});

    const results = [];

    for (const account of accounts) {
      if (cancelRef.current) break;

      const key = account.url;
      setStatus(key, 'loading');

      try {
        const params = new URLSearchParams({ url: account.url, name: account.name });
        const res = await fetch(`/api/screenshot?${params}`);
        const data = await res.json();

        if (data.error) {
          setStatus(key, 'error');
        } else {
          setStatus(key, 'done');
          results.push({ name: account.name, image: data.image, filename: data.filename });
        }
      } catch {
        setStatus(key, 'error');
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    setImages(results);
    setIsDone(true);
    setIsRunning(false);
  };

  const cancel = () => { cancelRef.current = true; };

  const downloadZip = async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const img of images) {
      const binary = atob(img.image);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      zip.file(img.filename, bytes);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'instagram_screenshots.zip';
    link.click();
  };

  const doneCount = Object.values(statuses).filter((s) => s === 'done').length;
  const errorCount = Object.values(statuses).filter((s) => s === 'error').length;
  const processedCount = doneCount + errorCount;
  const progress = accounts.length > 0 ? (processedCount / accounts.length) * 100 : 0;

  return (
    <div style={s.page}>
      <div style={s.container}>
        <h1 style={s.title}>Instagram スクリーンショット</h1>
        <p style={s.subtitle}>URLをコピペして一括撮影 → ZIPでダウンロード</p>

        {/* URLリスト入力 */}
        <div style={s.inputSection}>
          <div style={s.labelRow}>
            <label style={s.label}>URLリスト（1行1件）</label>
            <span style={s.countBadge}>{accounts.length}件</span>
          </div>
          <textarea
            style={s.textarea}
            value={listText}
            onChange={(e) => setListText(e.target.value)}
            rows={8}
            placeholder={`https://www.instagram.com/xxx\nhttps://www.instagram.com/yyy\n\n名前付きの場合:\n名前,https://www.instagram.com/xxx`}
            disabled={isRunning}
            spellCheck={false}
          />
          <div style={s.hintRow}>
            <span style={s.hint}>URLのみ貼り付ければOK（最大100件）</span>
            <button
              style={s.clearBtn}
              onClick={() => setListText('')}
              disabled={isRunning}
            >
              クリア
            </button>
          </div>
        </div>

        {/* 進捗バー */}
        {isRunning && (
          <div style={s.progressSection}>
            <div style={s.progressTrack}>
              <div style={{ ...s.progressFill, width: `${progress}%` }} />
            </div>
            <span style={s.progressLabel}>
              {processedCount} / {accounts.length} 完了
              {errorCount > 0 && <span style={{ color: '#dc2626' }}> （{errorCount}件失敗）</span>}
            </span>
          </div>
        )}

        {/* 実行・中断ボタン */}
        <div style={s.btnRow}>
          <button
            style={{ ...s.mainBtn, ...(isRunning || accounts.length === 0 ? s.btnOff : {}) }}
            onClick={takeScreenshots}
            disabled={isRunning || accounts.length === 0}
          >
            {isRunning
              ? `撮影中... ${processedCount} / ${accounts.length}`
              : `スクリーンショットを撮る（${accounts.length}件）`}
          </button>
          {isRunning && (
            <button style={s.stopBtn} onClick={cancel}>
              中断
            </button>
          )}
        </div>

        {/* 完了後ダウンロード */}
        {isDone && (
          <div style={s.resultBox}>
            <p style={s.resultMsg}>
              {doneCount}件成功
              {errorCount > 0 && <span style={{ color: '#dc2626' }}> / {errorCount}件失敗</span>}
            </p>
            {images.length > 0 && (
              <button style={s.zipBtn} onClick={downloadZip}>
                ZIPでダウンロード（{images.length}枚）
              </button>
            )}
          </div>
        )}

        {/* ステータス一覧 */}
        {Object.keys(statuses).length > 0 && (
          <div style={s.statusList}>
            {accounts.map((account) => {
              const status = statuses[account.url] || 'idle';
              return (
                <div key={account.url} style={s.statusRow}>
                  <span style={s.statusName}>{account.name}</span>
                  <span style={{ ...s.statusBadge, color: STATUS_COLOR[status] }}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    padding: '32px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  container: {
    maxWidth: '580px',
    margin: '0 auto',
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '28px 24px',
    boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
  },
  title: { fontSize: '20px', fontWeight: '700', color: '#111827', margin: '0 0 4px' },
  subtitle: { fontSize: '13px', color: '#6b7280', margin: '0 0 20px' },

  inputSection: { marginBottom: '16px' },
  labelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  label: { fontSize: '13px', fontWeight: '600', color: '#374151' },
  countBadge: {
    fontSize: '12px', color: '#6b7280', backgroundColor: '#f3f4f6',
    padding: '2px 8px', borderRadius: '99px',
  },
  textarea: {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px',
    border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '12px',
    fontFamily: 'ui-monospace, monospace', resize: 'vertical', color: '#1f2937',
    lineHeight: '1.7', outline: 'none',
  },
  hintRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px',
  },
  hint: { fontSize: '11px', color: '#9ca3af' },
  clearBtn: {
    fontSize: '11px', padding: '3px 10px', border: '1px solid #d1d5db',
    borderRadius: '6px', background: '#fff', color: '#6b7280', cursor: 'pointer',
  },

  progressSection: { marginBottom: '14px' },
  progressTrack: {
    height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden',
  },
  progressFill: {
    height: '6px', backgroundColor: '#111827', borderRadius: '3px', transition: 'width 0.3s ease',
  },
  progressLabel: { display: 'block', fontSize: '12px', color: '#6b7280', marginTop: '5px', textAlign: 'right' },

  btnRow: { display: 'flex', gap: '8px', marginBottom: '16px' },
  mainBtn: {
    flex: 1, padding: '14px', backgroundColor: '#111827', color: '#fff',
    border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  },
  btnOff: { backgroundColor: '#9ca3af', cursor: 'not-allowed' },
  stopBtn: {
    padding: '14px 18px', backgroundColor: '#fff', color: '#374151',
    border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px',
    fontWeight: '600', cursor: 'pointer',
  },

  resultBox: {
    textAlign: 'center', padding: '16px', backgroundColor: '#f9fafb',
    borderRadius: '8px', marginBottom: '16px',
  },
  resultMsg: { fontSize: '14px', color: '#374151', margin: '0 0 10px' },
  zipBtn: {
    padding: '11px 24px', backgroundColor: '#2563eb', color: '#fff',
    border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  },

  statusList: {
    border: '1px solid #f3f4f6', borderRadius: '8px',
    maxHeight: '360px', overflowY: 'auto',
  },
  statusRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', borderBottom: '1px solid #f9fafb',
  },
  statusName: {
    fontSize: '12px', color: '#374151', flex: 1, paddingRight: '8px',
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
  },
  statusBadge: { fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' },
};
