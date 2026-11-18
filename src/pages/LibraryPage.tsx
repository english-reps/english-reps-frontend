import { useState } from "react";
import { useCatalog } from "../services/catalog";
import { definition, type Word } from "../domain/types";
import { ErrorNotice, Loading } from "../components/Common";
import { WordDetails } from "../components/WordDetails";
export function LibraryPage() {
  const bank = useCatalog<Word>("vocabulary");
  const [query, setQuery] = useState(""),
    [unit, setUnit] = useState("all"),
    [pos, setPos] = useState("all"),
    [page, setPage] = useState(0);
  const result = bank.entries.filter(
    (word) =>
      (unit === "all" || word.unit === Number(unit)) &&
      (pos === "all" || word.senses.some((sense) => sense.pos === pos)) &&
      `${word.word} ${definition(word)}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  if (bank.loading) return <Loading />;
  if (bank.error)
    return <ErrorNotice message={bank.error} retry={bank.retry} />;
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORD COLLECTION</p>
          <h1>單字庫</h1>
          <p>1,000 個多益單字，隨時查找。</p>
        </div>
      </div>
      {bank.offline && (
        <ErrorNotice
          message="目前無法連線到題庫伺服器，已改用內建離線單字庫。"
          retry={bank.retry}
        />
      )}
      <div className="library-toolbar">
        <label>
          搜尋單字或中文
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          單元
          <select
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">全部單元</option>
            {Array.from({ length: 20 }, (_, i) => (
              <option key={i} value={i + 1}>
                單元 {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          詞性
          <select
            value={pos}
            onChange={(e) => {
              setPos(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">全部詞性</option>
            {[
              ...new Set(
                bank.entries.flatMap((word) =>
                  word.senses.map((sense) => sense.pos),
                ),
              ),
            ]
              .sort()
              .map((pos) => (
                <option key={pos}>{pos}</option>
              ))}
          </select>
        </label>
      </div>
      <p role="status">找到 {result.length.toLocaleString()} 個單字</p>
      <div className="study-panel word-list">
        {result.slice(page * 20, page * 20 + 20).map((word) => (
          <details className="word-row" key={word.id}>
            <summary className="word-row-summary">
              <strong>{word.word}</strong>
              <span>{definition(word)}</span>
              <span>＋</span>
            </summary>
            <div className="word-row-content">
              <WordDetails word={word} />
              <p className="word-source">
                原始表第 {word.page} 頁 · 單元 {word.unit}
              </p>
            </div>
          </details>
        ))}
        {!result.length && <p className="empty-state">沒有找到符合的單字。</p>}
      </div>
      <div className="pagination">
        <button
          className="button secondary"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          上一頁
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(result.length / 20))}
        </span>
        <button
          className="button secondary"
          disabled={(page + 1) * 20 >= result.length}
          onClick={() => setPage(page + 1)}
        >
          下一頁
        </button>
      </div>
    </section>
  );
}
