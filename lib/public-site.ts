import "server-only";

import { getPool } from "@/lib/db/pool";
import { getAppVersionInfo, type AppVersionInfo } from "@/lib/version/app-version";

export interface PublicPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  durationDays: number;
  description: string;
  recommended: boolean;
  entitlements: Record<string, boolean | number | string | null>;
}

export interface TrialInfo {
  durationDays: number;
  aiQuestionsDaily: number;
  imagesTotal: number;
  filesTotal: number;
  studyPacksTotal: number;
}

export interface PublicContactInfo {
  email: string;
  whatsapp: string;
  refundPolicy: string;
}

export interface PublicSiteData {
  plans: PublicPlan[];
  trial: TrialInfo;
  contact: PublicContactInfo;
  appVersion: AppVersionInfo;
}

const DEFAULT_TRIAL: TrialInfo = {
  durationDays: 3,
  aiQuestionsDaily: 10,
  imagesTotal: 3,
  filesTotal: 1,
  studyPacksTotal: 1,
};

const EMPTY_CONTACT: PublicContactInfo = {
  email: "",
  whatsapp: "",
  refundPolicy: "",
};

function scalar(value: unknown): boolean | number | string | null {
  return typeof value === "boolean" || typeof value === "number" || typeof value === "string" || value === null
    ? value
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function getPublicSiteData(): Promise<PublicSiteData> {
  const appVersionPromise = getAppVersionInfo();

  try {
    const [plansResult, settingsResult, appVersion] = await Promise.all([
      getPool().query<{
        id: string;
        name: string;
        price: string | number;
        currency: string;
        duration_days: number;
        description: string;
        recommended: boolean;
        entitlements: Record<string, unknown>;
      }>(`select p.id,p.name,p.price,p.currency,p.duration_days,p.description,p.recommended,
          coalesce(jsonb_object_agg(e.feature_key,e.value) filter(where e.feature_key is not null),'{}') entitlements
        from public.subscription_plans p
        left join public.plan_entitlements e on e.plan_id=p.id
        where p.active=true
        group by p.id
        order by p.sort_order,p.name`),
      getPool().query<{ key: string; value: unknown }>(
        `select key,value from public.settings
         where key like 'trial_%' or key='public_site'`
      ),
      appVersionPromise,
    ]);

    const settings = new Map(settingsResult.rows.map((row) => [row.key, row.value]));
    const publicSiteRaw = settings.get("public_site");
    const publicSite = publicSiteRaw && typeof publicSiteRaw === "object"
      ? publicSiteRaw as Record<string, unknown>
      : {};

    return {
      plans: plansResult.rows.map((plan) => ({
        id: plan.id,
        name: plan.name,
        price: Number(plan.price),
        currency: plan.currency,
        durationDays: plan.duration_days,
        description: plan.description,
        recommended: plan.recommended,
        entitlements: Object.fromEntries(
          Object.entries(plan.entitlements ?? {}).map(([key, value]) => [key, scalar(value)])
        ),
      })),
      trial: {
        durationDays: Number(settings.get("trial_duration_days") ?? DEFAULT_TRIAL.durationDays),
        aiQuestionsDaily: Number(settings.get("trial_ai_questions_daily") ?? DEFAULT_TRIAL.aiQuestionsDaily),
        imagesTotal: Number(settings.get("trial_images_total") ?? DEFAULT_TRIAL.imagesTotal),
        filesTotal: Number(settings.get("trial_files_total") ?? DEFAULT_TRIAL.filesTotal),
        studyPacksTotal: Number(settings.get("trial_study_pack_total") ?? DEFAULT_TRIAL.studyPacksTotal),
      },
      contact: {
        email: text(publicSite.contact_email),
        whatsapp: text(publicSite.whatsapp),
        refundPolicy: text(publicSite.refund_policy),
      },
      appVersion,
    };
  } catch {
    return {
      plans: [],
      trial: DEFAULT_TRIAL,
      contact: EMPTY_CONTACT,
      appVersion: await appVersionPromise,
    };
  }
}
