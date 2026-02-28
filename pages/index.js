import { useState } from 'react';

const ACCOUNTS = [
  { name: 'ちろ⌇平日料理しない冷凍ママ', url: 'https://www.instagram.com/chiro_reito_recipe/' },
  { name: 'えむ|平日のお守り！冷凍ストック献立', url: 'https://www.instagram.com/emu_gohan_stock' },
  { name: 'まよ⌇とにかくラクするズボラ主婦', url: 'https://www.instagram.com/mayo_zuboragohan' },
  { name: 'かおり | 23時からの晩酌レシピ', url: 'https://www.instagram.com/kaori_banshaku' },
  { name: 'あんず ⌇ 愛する人を沼らせレシピ', url: 'https://www.instagram.com/an_zu_recipe' },
  { name: 'ひな⌇産後17kg痩せたヘルシーレシピ', url: 'https://www.instagram.com/hina_recipe_diet' },
];

const STATUS_LABEL = {
  idle: '待機中',
  loading: '撮影中...',
  done: '完了',
  error: '失敗',
};

const STATUS_COLOR = {
  idle: '#999',
  loading: '#f59e0b',
  done: '#16a34a',
  error: '#dc2626',
};

export default function Home() {
  const [statuses, setStatuses] = useState({});
  const [images, setImages] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const setStatus = (name, status) =>
    setStatuses((prev) => ({ ...prev, [name]: status }));

  const takeScreenshots = async () => {
    setIsRunning(true);
    setIsDone(false);
    setImages([]);
    setStatuses({});

    const results = [];

    for (const account of ACCOUNTS) {
      setStatus(account.name, 'loading');

      try {
        const params = new URLSearchParams({ url: account.url, name: account.name });
        const res = await fetch(`/api/screenshot?${params}`);
        const data = await res.json();

        if (data.error) {
          setStatus(account.name, 'error');
        } else {
          setStatus(account.name, 'done');
          results.push({ name: account.name, image: data.image, filename: data.filename });
        }
      } catch (_) {
        setStatus(account.name, 'error');
      }

      // Instagram へのリクエスト間隔
      await new Promise((r) => setTimeout(r, 1500));
    }

    setImages(results);
    setIsDone(true);
    setIsRunning(false);
  };

  const downloadZip = async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    for (const img of images) {
      const binary = atob(img.image);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
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
  const total = ACCOUNTS.length;

  return (
    <div style={s.page}>
      <div style={s.container}>
        <h1 style={s.title}>Instagram スクリーンショット</h1>
        <p style={s.subtitle}>プロフィールページを一括撮影してZIPでダウンロードできます</p>

        <div style={s.list}>
          {ACCOUNTS.map((account) => {
            const status = statuses[account.name] || 'idle';
            return (
              <div key={account.name} style={s.item}>
                <span style={s.accountName}>{account.name}</span>
                <span style={{ ...s.badge, color: STATUS_COLOR[status] }}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
            );
          })}
        </div>

        {isRunning && (
          <div style={s.progress}>
            <div style={{ ...s.bar, width: `${((doneCount + errorCount) / total) * 100}%` }} />
          </div>
        )}

        <button
          style={{ ...s.btn, ...(isRunning ? s.btnDisabled : {}) }}
          onClick={takeScreenshots}
          disabled={isRunning}
        >
          {isRunning
            ? `撮影中... ${doneCount + errorCount} / ${total}`
            : 'スクリーンショットを撮る'}
        </button>

        {isDone && (
          <div style={s.result}>
            <p style={s.resultText}>
              {doneCount}件成功
              {errorCount > 0 && <span style={s.errorText}> / {errorCount}件失敗</span>}
            </p>
            {images.length > 0 && (
              <button style={s.downloadBtn} onClick={downloadZip}>
                ZIPでダウンロード ({images.length}枚)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    padding: '40px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '32px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#111',
    margin: '0 0 6px',
  },
  subtitle: {
    fontSize: '13px',
    color: '#6b7280',
    margin: '0 0 28px',
  },
  list: {
    borderTop: '1px solid #f0f0f0',
    marginBottom: '24px',
  },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #f0f0f0',
  },
  accountName: {
    fontSize: '13px',
    color: '#1a1a1a',
    flex: 1,
    paddingRight: '12px',
  },
  badge: {
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  progress: {
    height: '4px',
    backgroundColor: '#f0f0f0',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '16px',
  },
  bar: {
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  btn: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  btnDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  result: {
    textAlign: 'center',
    marginTop: '20px',
  },
  resultText: {
    fontSize: '14px',
    color: '#374151',
    marginBottom: '12px',
  },
  errorText: {
    color: '#dc2626',
  },
  downloadBtn: {
    padding: '12px 28px',
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};
