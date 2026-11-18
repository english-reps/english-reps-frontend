import type { Word } from "../domain/types";
export function WordDetails({ word }: { word: Word }) {
  return (
    <div className="word-details">
      <div className="senses">
        {word.senses.map((sense, index) => (
          <p key={index}>
            <span className="word-pos">{sense.pos}</span> {sense.meaning}
          </p>
        ))}
      </div>
      <div className="example-block">
        <p className="example-en">{word.example}</p>
        <p className="example-zh">{word.translation}</p>
      </div>
    </div>
  );
}
