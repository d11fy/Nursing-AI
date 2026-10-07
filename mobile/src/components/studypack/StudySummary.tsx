import React from "react";
import type { SummaryContent } from "../../../../features/study-pack/types";
export function StudySummary({ content }: { content: SummaryContent }) {
  return (
    <div className="space-y-3 selectable-text">
      <section className="surface space-y-2">
        <h3 className="font-black text-primary">نظرة عامة</h3>
        <p className="text-sm leading-7">{content.overview}</p>
      </section>
      <section className="surface space-y-3">
        <h3 className="font-black">المفاهيم الأساسية</h3>
        {content.main_concepts?.map((item, index) => (
          <div key={index} className="space-y-1">
            <b className="text-sm">
              {item.concept}
              {item.arabic_term ? ` — ${item.arabic_term}` : ""}
            </b>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-7">
              {item.explanation}
            </p>
          </div>
        ))}
      </section>
      <section className="surface space-y-3">
        <h3 className="font-black">المصطلحات والتعريفات</h3>
        {content.important_definitions?.map((item, index) => (
          <div key={index}>
            <b className="text-sm">
              {item.term} · {item.arabic_translation}
            </b>
            <p className="text-sm leading-7 text-slate-500">
              {item.definition}
            </p>
          </div>
        ))}
      </section>
      {!!content.clinical_notes?.length && (
        <section className="surface space-y-3">
          <h3 className="font-black text-primary">ملاحظات وتطبيقات سريرية</h3>
          {content.clinical_notes.map((item, index) => (
            <div
              key={index}
              className="rounded-xl bg-teal-50 dark:bg-slate-800 p-3 text-sm leading-7"
            >
              <p>{item.note}</p>
              {item.importance && (
                <p className="font-bold mt-1">{item.importance}</p>
              )}
            </div>
          ))}
        </section>
      )}
      <section className="surface space-y-2">
        <h3 className="font-black">ما يجب تذكّره</h3>
        <ul className="list-disc ps-5 space-y-2 text-sm leading-7">
          {content.what_to_remember?.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </section>
      {!!content.source_references?.length && (
        <section className="surface text-sm space-y-2">
          <h3 className="font-black">المراجع</h3>
          {content.source_references.map((item, index) => (
            <p key={index}>{item}</p>
          ))}
        </section>
      )}
    </div>
  );
}
