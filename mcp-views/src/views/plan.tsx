import { useEffect, useMemo, useState } from "react";
import { plateOptions, renderPlateSvg } from "@/lib/plan-render";
import type { DrawnPlacePlan, PlacePlan } from "@/types/places";
import { imageSrc, OpenOnSite, plateLabels, useView } from "../shared";

/** La planche d'un plan dessiné, rendue ici comme sur le site. */
function Plate({
  plan,
  placeName,
}: {
  plan: DrawnPlacePlan;
  placeName: string;
}) {
  const { locale, t } = useView();
  const [levelId, setLevelId] = useState<string>();
  const svg = useMemo(() => {
    const labels = plateLabels(locale);
    return renderPlateSvg(plan, {
      ...plateOptions(plan, {
        placeName,
        glyphs: labels.glyphs as never,
        credits: labels.credits,
      }),
      ...(levelId && { levelIds: [levelId] }),
      fontCss: "",
    });
  }, [plan, placeName, locale, levelId]);

  return (
    <>
      {plan.levels.length > 1 && (
        <p className="tabs">
          <button
            type="button"
            className={levelId ? "" : "active"}
            onClick={() => setLevelId(undefined)}
          >
            {t("plan.allLevels")}
          </button>
          {plan.levels.map((level) => (
            <button
              key={level.id}
              type="button"
              className={levelId === level.id ? "active" : ""}
              onClick={() => setLevelId(level.id)}
            >
              {level.name}
            </button>
          ))}
        </p>
      )}
      {/* Le SVG vient du moteur de rendu des plans, qui échappe les textes. */}
      <div className="plate" dangerouslySetInnerHTML={{ __html: svg }} />
    </>
  );
}

function PlanBody({
  plan,
  placeName,
  base,
}: {
  plan: PlacePlan;
  placeName: string;
  base?: string;
}) {
  if (plan.kind === "drawn") return <Plate plan={plan} placeName={placeName} />;
  const image = imageSrc(plan.imageUrl, base);
  return image ? <img className="plate" src={image} alt={plan.name} /> : null;
}

/**
 * Un plan publié (`get_place_plan`), ou un brouillon après `plan_draft_render` :
 * la vue relit alors le brouillon par `plan_draft_get`.
 */
export function PlanView({ data }: { data: Record<string, unknown> }) {
  const { app, input, t } = useView();
  const draftId =
    typeof input?.draftId === "string" ? input.draftId : undefined;
  const [draft, setDraft] = useState<{
    plan: DrawnPlacePlan;
    placeName: string;
    url?: string;
  }>();
  const isDraft = Array.isArray(data.issues) && !data.plan;

  useEffect(() => {
    if (!isDraft || !draftId) return;
    let live = true;
    app
      .callServerTool({ name: "plan_draft_get", arguments: { draftId } })
      .then((result) => {
        const content = result.structuredContent as
          | {
              plan?: DrawnPlacePlan;
              draft?: { placeName?: string; url?: string };
            }
          | undefined;
        if (live && content?.plan) {
          setDraft({
            plan: content.plan,
            placeName: content.draft?.placeName ?? "",
            url: content.draft?.url,
          });
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [app, draftId, isDraft]);

  if (isDraft) {
    const issues = data.issues as string[];
    return (
      <section>
        <p className="meta">{t("plan.draft")}</p>
        {draft ? (
          <Plate plan={draft.plan} placeName={draft.placeName} />
        ) : (
          <p className="muted">{t("common.loading")}</p>
        )}
        <h2>{t("plan.issues")}</h2>
        {issues.length === 0 ? (
          <p className="ok">{t("plan.noIssue")}</p>
        ) : (
          <ul className="issues">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const plan = data.plan as PlacePlan | undefined;
  const url = typeof data.url === "string" ? data.url : undefined;
  if (!plan) return <p className="muted">{t("common.empty")}</p>;
  return (
    <section>
      <PlanBody
        plan={plan}
        placeName={String(data.placeName ?? "")}
        base={url}
      />
      <OpenOnSite href={url} />
    </section>
  );
}
