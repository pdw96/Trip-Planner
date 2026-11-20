"use client";

import { useState } from "react";
import { buttonClass, cardClass, secondaryButtonClass } from "@/app/ui/styles";
import {
  type ActualMoney,
  type BudgetSettings,
  formatMoney,
  type Money,
  type PeriodTotal,
  toBudgetMinor,
} from "@/lib/budget";
import { dateLabel } from "@/lib/schedule";
import {
  BudgetSettingsForm,
  type DateChoice,
  ExtraItemForm,
} from "./budget-forms";
import type { PanelBudget, PanelDay, PanelExtra } from "./map-types";
import { RATE_SOURCE_LABELS } from "./money-fields";

// 지도 칸 탭 아래의 예산 카드(#14 설계 §5.7.1). [전체]는 총 예산·예상 총지출·날짜별 표·여행 전체 항목·설정,
// [N일차]는 그날 예상·실제와 일정 밖 지출. 숫자는 서버가 계산해 넘긴다. 금액은 일정 줄에 보이지 않는다.

const budgetCardClass = `flex flex-col gap-3 ${cardClass}`;
const linkButtonClass = `self-start ${buttonClass("quiet", "small")}`;
const OVER = "text-danger";
const UNDER = "text-ok";

type Props = {
  tripId: string;
  budget: PanelBudget;
  // "all" 또는 날짜.
  tab: string;
  days: PanelDay[];
  onSelectTab: (tab: string) => void;
};

export function BudgetCard(props: Props) {
  // 탭을 바꾸면 열린 양식을 닫는다.
  return <CardBody key={props.tab} {...props} />;
}

function CardBody({ tripId, budget, tab, days, onSelectTab }: Props) {
  // 한 번에 한 양식: "settings" | "add" | "edit:<id>"
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setOpen(null);

  if (!budget) {
    if (tab !== "all") return null;
    return (
      <section aria-label="예산" className={budgetCardClass}>
        {open === "settings" ? (
          <BudgetSettingsForm tripId={tripId} settings={null} onClose={close} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-sub">
              예산을 정하면 일정마다 예상 비용과 실제 지출을 적을 수 있어요.
            </p>
            <button
              type="button"
              onClick={() => setOpen("settings")}
              className={secondaryButtonClass}
            >
              예산 정하기
            </button>
          </div>
        )}
      </section>
    );
  }

  const { settings } = budget;
  const currencies = {
    currency: settings.currency,
    localCurrency: settings.localCurrency,
  };
  const dateChoices: DateChoice[] = [
    { value: "", label: "여행 전체" },
    ...days.map((d) => ({ value: d.date, label: d.label })),
  ];
  const day = tab === "all" ? null : days.find((d) => d.date === tab);
  const extras = budget.extras.filter((e) =>
    day ? e.date === day.date : e.date === null,
  );
  // 여행 날짜를 줄여 기간 밖으로 밀려난 일정 밖 항목. [전체]에서 고치거나 지울 수 있게 따로 보인다(#14 리뷰).
  const tripDates = new Set(days.map((d) => d.date));
  const outsideExtras = budget.extras.filter(
    (e) => e.date !== null && !tripDates.has(e.date),
  );

  // 고치는 항목의 날짜가 기간 밖이면 그 날짜도 고를 수 있게 둔다(저장해도 그대로 남도록).
  const renderForm = (item: PanelExtra | null) => (
    <ExtraItemForm
      tripId={tripId}
      currencies={currencies}
      item={item}
      defaultDate={day?.date ?? ""}
      dates={
        item?.date && !tripDates.has(item.date)
          ? [
              ...dateChoices,
              {
                value: item.date,
                label: `${dateLabel(item.date, true)} (여행 기간 밖)`,
              },
            ]
          : dateChoices
      }
      onClose={close}
    />
  );

  const extraList = (
    <ExtraList
      extras={extras}
      settings={settings}
      open={open}
      setOpen={setOpen}
      addLabel={day ? "+ 지출 추가" : "+ 항목 추가"}
      renderForm={renderForm}
    />
  );

  if (day) {
    return (
      <section
        aria-label={`${day.dayNumber}일차 예산`}
        className={budgetCardClass}
      >
        <h3 className="font-semibold">{day.dayNumber}일차 예산</h3>
        <PeriodLine
          total={budget.periods.byDate[day.date]}
          settings={settings}
        />
        <h4 className="text-sm font-medium">일정 밖 지출</h4>
        {extraList}
      </section>
    );
  }

  return (
    <section aria-label="예산" className={budgetCardClass}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">예산</h3>
        {open !== "settings" && (
          <button
            type="button"
            onClick={() => setOpen("settings")}
            className={linkButtonClass}
          >
            설정
          </button>
        )}
      </div>
      {open === "settings" ? (
        <BudgetSettingsForm
          tripId={tripId}
          settings={settings}
          onClose={close}
        />
      ) : (
        <Summary budget={budget} />
      )}
      <DayTable budget={budget} days={days} onSelectTab={onSelectTab} />
      <h4 className="text-sm font-medium">여행 전체 항목</h4>
      {extraList}
      {outsideExtras.length > 0 && (
        <>
          <h4 className="text-sm font-medium">여행 기간 밖 항목</h4>
          <ExtraList
            extras={outsideExtras}
            settings={settings}
            open={open}
            setOpen={setOpen}
            addLabel={null}
            renderForm={renderForm}
          />
        </>
      )}
    </section>
  );
}

function money(minor: number, settings: BudgetSettings): string {
  return formatMoney(minor, settings.currency);
}

// 여유(양수)·초과(음수)·딱 맞음.
function BalanceText({
  balance,
  settings,
}: {
  balance: number;
  settings: BudgetSettings;
}) {
  if (balance === 0) return <span>딱 맞아요</span>;
  return balance < 0 ? (
    <span className={OVER}>{money(-balance, settings)} 초과</span>
  ) : (
    <span className={UNDER}>{money(balance, settings)} 여유</span>
  );
}

function Row({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-3 ${strong ? "font-semibold" : "text-sm"}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

function Summary({ budget }: { budget: NonNullable<PanelBudget> }) {
  const { settings, summary: s } = budget;
  if (!s.hasActual) {
    // 예산 짜는 중: 계획 합계와 총 예산을 바로 비교한다.
    return (
      <div className="flex flex-col gap-1">
        <Row label="총 예산">{money(s.total, settings)}</Row>
        <Row label="계획 합계" strong>
          {money(s.planned, settings)} ·{" "}
          <BalanceText balance={s.total - s.planned} settings={settings} />
        </Row>
      </div>
    );
  }
  const over = s.actualOverPlan;
  const overText =
    over === 0
      ? "예상대로"
      : over > 0
        ? `그 항목들 예상보다 ${money(over, settings)} 더`
        : `그 항목들 예상보다 ${money(-over, settings)} 덜`;
  return (
    <div className="flex flex-col gap-1">
      <Row label="총 예산">{money(s.total, settings)}</Row>
      <Row label="예상 총지출" strong>
        {money(s.projected, settings)} ·{" "}
        <BalanceText balance={s.balance} settings={settings} />
      </Row>
      <p className="text-sm text-sub">
        실제 적은 것 {money(s.actual, settings)} ({overText}
        {s.unplanned > 0 &&
          ` · 계획에 없던 지출 ${money(s.unplanned, settings)} 포함`}
        ) · 남은 예상 {money(s.remaining, settings)}
      </p>
      <Row label="계획 합계">{money(s.planned, settings)}</Row>
    </div>
  );
}

function amountOrDash(minor: number, has: boolean, settings: BudgetSettings) {
  return has ? money(minor, settings) : "—";
}

function DayTable({
  budget,
  days,
  onSelectTab,
}: {
  budget: NonNullable<PanelBudget>;
  days: PanelDay[];
  onSelectTab: (tab: string) => void;
}) {
  const { settings, periods } = budget;
  if (days.length === 0 && !periods.outside) return null;
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="text-sub">
          <th className="text-left font-medium">날짜별</th>
          <th className="text-right font-medium">예상</th>
          <th className="text-right font-medium">실제</th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => {
          const t = periods.byDate[d.date];
          return (
            <tr key={d.date}>
              <td>
                <button
                  type="button"
                  onClick={() => onSelectTab(d.date)}
                  title={d.label}
                  className="hover:underline"
                >
                  {d.dayNumber}일차
                </button>
              </td>
              <td className="text-right">
                {amountOrDash(
                  t?.estimate ?? 0,
                  !!t && t.estimate > 0,
                  settings,
                )}
              </td>
              <td className="text-right">
                {amountOrDash(t?.actual ?? 0, !!t && t.diff !== null, settings)}
              </td>
            </tr>
          );
        })}
        {periods.outside && (
          <tr>
            <td>여행 기간 밖</td>
            <td className="text-right">
              {amountOrDash(
                periods.outside.estimate,
                periods.outside.estimate > 0,
                settings,
              )}
            </td>
            <td className="text-right">
              {amountOrDash(
                periods.outside.actual,
                periods.outside.diff !== null,
                settings,
              )}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function signed(diff: number, currency: string): string {
  if (diff === 0) return "예상대로";
  return diff > 0
    ? `+${formatMoney(diff, currency)}`
    : `−${formatMoney(-diff, currency)}`;
}

// N일차 한 줄: 그날 금액이 한 통화면 그 통화로, 예산 통화와 다르면 둘째 줄에 예산 통화로 바꾼 값.
function PeriodLine({
  total,
  settings,
}: {
  total: PeriodTotal | undefined;
  settings: BudgetSettings;
}) {
  if (!total) {
    return (
      <p className="text-sm text-sub">
        이날 적은 금액이 없어요. 일정의 예상 비용이나 일정 밖 지출을 적어
        보세요.
      </p>
    );
  }
  const native = total.native;
  const shown = native ?? {
    currency: settings.currency,
    estimate: total.estimate,
    actual: total.actual,
    diff: total.diff,
  };
  const c = shown.currency;
  const diffClass =
    shown.diff === null || shown.diff === 0
      ? ""
      : shown.diff > 0
        ? OVER
        : UNDER;
  return (
    <div className="flex flex-col gap-0.5 tabular-nums">
      <p>
        예상 {formatMoney(shown.estimate, c)}
        {shown.diff !== null && (
          <>
            {" "}
            · 실제 {formatMoney(shown.actual, c)}{" "}
            <span className={diffClass}>({signed(shown.diff, c)})</span>
          </>
        )}
      </p>
      {native && native.currency !== settings.currency && (
        <p className="text-sm text-sub">
          ≈ 예상 {money(total.estimate, settings)}
          {total.diff !== null && ` · 실제 ${money(total.actual, settings)}`}
        </p>
      )}
    </div>
  );
}

function MoneyCell({
  value,
  settings,
  rate,
}: {
  value: Money | ActualMoney | null;
  settings: BudgetSettings;
  rate: string | null;
}) {
  if (!value) return <span className="text-sub">—</span>;
  const text = formatMoney(value.amount, value.currency);
  if (value.currency === settings.currency) return <span>{text}</span>;
  const converted = money(
    toBudgetMinor(value, rate, settings.currency),
    settings,
  );
  const source =
    "rateSource" in value && value.rateSource
      ? ` · ${RATE_SOURCE_LABELS[value.rateSource]}`
      : "";
  return (
    <span>
      {text}{" "}
      <span className="text-sub">
        (≈{converted}
        {source})
      </span>
    </span>
  );
}

function ExtraList({
  extras,
  settings,
  open,
  setOpen,
  addLabel,
  renderForm,
}: {
  extras: PanelExtra[];
  settings: BudgetSettings;
  open: string | null;
  setOpen: (key: string | null) => void;
  // null 이면 추가 버튼 없음.
  addLabel: string | null;
  renderForm: (item: PanelExtra | null) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      {extras.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {extras.map((item) =>
            open === `edit:${item.id}` ? (
              <li key={item.id}>{renderForm(item)}</li>
            ) : (
              <li
                key={item.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3"
              >
                <button
                  type="button"
                  onClick={() => setOpen(`edit:${item.id}`)}
                  className="min-w-0 text-left break-words hover:underline"
                >
                  {item.title}
                </button>
                <span className="tabular-nums">
                  <span className="text-sub">예상 </span>
                  <MoneyCell
                    value={item.estimate}
                    settings={settings}
                    rate={settings.plannedRate}
                  />
                  <span className="text-sub"> · 실제 </span>
                  <MoneyCell
                    value={item.actual}
                    settings={settings}
                    rate={item.actual?.rate ?? null}
                  />
                </span>
              </li>
            ),
          )}
        </ul>
      )}
      {addLabel === null ? null : open === "add" ? (
        renderForm(null)
      ) : (
        <button
          type="button"
          onClick={() => setOpen("add")}
          className={linkButtonClass}
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}
