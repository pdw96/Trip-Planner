"use client";

import { useState } from "react";
import {
  buttonClass,
  cardClass,
  emptyStateClass,
  secondaryButtonClass,
} from "@/app/ui/styles";
import {
  type ActualMoney,
  type CurrencySettings,
  formatMoney,
  type Money,
  type PeriodTotal,
  toBudgetMinor,
} from "@/lib/budget";
import { lineClass } from "@/lib/day-line";
import { dateLabel, type TripDay } from "@/lib/schedule";
import {
  type BudgetConfig,
  BudgetSettingsForm,
  ExtraItemForm,
  tripDateChoices,
} from "./budget-forms";
import { BalanceText, BudgetBar, PrivateBadge } from "./budget-meter";
import type { PanelBudget, PanelExtra, PanelWallet } from "./map-types";
import { RATE_SOURCE_LABELS } from "./money-fields";

// 예산 카드(#14 설계 §5.7.1, 자리는 예산 시트 #97). [전체]는 총 예산·예상 총지출·날짜별 표·여행 전체 항목·설정,
// [N일차]는 그날 예상·실제와 일정 밖 지출. 숫자는 서버가 계산해 넘긴다. 금액은 일정 줄에 보이지 않는다.
// 지갑(모임·내 돈, #89)마다 카드 하나. 모임 통장 여행은 모임 카드 하나라 지금과 같다.

const budgetCardClass = `flex flex-col gap-3 ${cardClass}`;
const linkButtonClass = `self-start ${buttonClass("quiet", "small")}`;
const OVER = "text-danger";
const UNDER = "text-ok";

// 한 번에 한 양식(카드 사이에서도): "settings" | "settings:mine" | "add:<쪽>" | "edit:<id>".
// 설정 양식은 첫 카드에만 열린다. "settings:mine" 은 내 예산 칸에 초점을 둔다.
type OpenForm = string | null;

type Props = {
  tripId: string;
  budget: PanelBudget;
  // 여행 주인인지. 예산이 없을 때(budget null) 설정 양식의 방식 고르기에 쓴다. 있으면 budget.config.isOwner.
  isOwner: boolean;
  // "all" 또는 날짜.
  tab: string;
  days: TripDay[];
  onSelectTab: (tab: string) => void;
  // 이 양식이 열린 채로 시작한다(예산 없는 여행의 "예산 정하기", #97). 처음 연 탭에서만.
  initialForm?: "settings";
};

export function BudgetCards(props: Props) {
  // 처음 연 탭. 탭을 한 번 바꾸면 null 이 되어, 돌아와도 처음 양식이 저절로 다시 열리지 않는다.
  const [firstTab, setFirstTab] = useState<string | null>(props.tab);
  if (firstTab !== null && props.tab !== firstTab) setFirstTab(null);
  // 탭을 바꾸면 열린 양식을 닫는다.
  return (
    <CardsBody
      key={props.tab}
      {...props}
      initialForm={props.tab === firstTab ? props.initialForm : undefined}
    />
  );
}

function CardsBody({
  tripId,
  budget,
  isOwner,
  tab,
  days,
  onSelectTab,
  initialForm,
}: Props) {
  const [open, setOpen] = useState<OpenForm>(initialForm ?? null);
  const close = () => setOpen(null);

  if (!budget) {
    return (
      <section
        aria-label="예산"
        className={open === "settings" ? budgetCardClass : emptyStateClass}
      >
        {open === "settings" ? (
          <BudgetSettingsForm
            tripId={tripId}
            config={null}
            isOwner={isOwner}
            onClose={close}
          />
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
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

  const { config, wallets } = budget;
  const day = tab === "all" ? null : (days.find((d) => d.date === tab) ?? null);
  const settingsOpen = open === "settings" || open === "settings:mine";
  const settingsForm = settingsOpen ? (
    <BudgetSettingsForm
      tripId={tripId}
      config={config}
      isOwner={config.isOwner}
      sharedLeftover={
        config.mode === "personal" && wallets.some((w) => w.side === "shared")
      }
      focus={open === "settings:mine" ? "mine" : "total"}
      onClose={close}
    />
  ) : null;

  return (
    <div className="flex flex-col gap-3">
      {wallets.map((wallet, index) => (
        <BudgetCard
          key={wallet.side}
          tripId={tripId}
          config={config}
          wallet={wallet}
          day={day}
          days={days}
          onSelectTab={onSelectTab}
          first={index === 0}
          open={open}
          setOpen={setOpen}
          settingsForm={index === 0 ? settingsForm : null}
        />
      ))}
    </div>
  );
}

function BudgetCard({
  tripId,
  config,
  wallet,
  day,
  days,
  onSelectTab,
  first,
  open,
  setOpen,
  settingsForm,
}: {
  tripId: string;
  config: BudgetConfig;
  wallet: PanelWallet;
  // null 이면 [전체].
  day: TripDay | null;
  days: TripDay[];
  onSelectTab: (tab: string) => void;
  // 첫 카드에만 [설정] 버튼과 설정 양식.
  first: boolean;
  open: OpenForm;
  setOpen: (key: OpenForm) => void;
  // 열린 설정 양식(첫 카드에만 넘어온다).
  settingsForm: React.ReactNode;
}) {
  const mine = wallet.side === "mine";
  const close = () => setOpen(null);
  const settingsOpen = open === "settings" || open === "settings:mine";
  const currencies = {
    currency: config.currency,
    localCurrency: config.localCurrency,
  };
  const dateChoices = tripDateChoices(days);
  const extras = wallet.extras.filter((e) =>
    day ? e.date === day.date : e.date === null,
  );
  // 여행 날짜를 줄여 기간 밖으로 밀려난 일정 밖 항목. [전체]에서 고치거나 지울 수 있게 따로 보인다(#14 리뷰).
  const tripDates = new Set(days.map((d) => d.date));
  const outsideExtras = wallet.extras.filter(
    (e) => e.date !== null && !tripDates.has(e.date),
  );
  // 예산 정하기 버튼: [전체]에서만(설정 양식이 거기 있다). 내 예산은 모임 통장 방식에서는 저장되지 않으므로
  // (서버가 내 돈을 쓰는 방식에서만 내 예산을 쓴다) 남은 내 돈 행 때문에 보이는 카드에는 버튼이 없다.
  const onSet =
    !day && !settingsOpen && (!mine || config.mode !== "shared")
      ? () => setOpen(mine ? "settings:mine" : "settings")
      : null;

  // 고치는 항목의 날짜가 기간 밖이면 그 날짜도 고를 수 있게 둔다(저장해도 그대로 남도록).
  // 쪽은 이 카드의 지갑(넣기는 서버가 이 값으로 모임·내 돈을 정하고, 고치기는 저장된 행의 쪽을 쓴다).
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
      sides={[wallet.side]}
      onClose={close}
    />
  );

  const extraList = (
    <ExtraList
      extras={extras}
      settings={config}
      open={open}
      setOpen={setOpen}
      addKey={`add:${wallet.side}`}
      addLabel={day ? "+ 지출 추가" : "+ 항목 추가"}
      renderForm={renderForm}
    />
  );

  const head = <BudgetHead config={config} wallet={wallet} onSet={onSet} />;

  if (day) {
    const title = mine
      ? `${day.dayNumber}일차 내 예산`
      : `${day.dayNumber}일차 예산`;
    return (
      <section aria-label={title} className={budgetCardClass}>
        <CardTitle mine={mine}>
          {day.dayNumber}
          {mine ? "일차 내 예산" : "일차 예산"}
        </CardTitle>
        {head}
        <PeriodLine total={wallet.periods.byDate[day.date]} settings={config} />
        <h4 className="text-sm font-medium">일정 밖 지출</h4>
        {extraList}
      </section>
    );
  }

  const title = mine ? "내 예산" : "전체 예산";
  return (
    <section aria-label={title} className={budgetCardClass}>
      <div className="flex items-center justify-between gap-2">
        <CardTitle mine={mine}>{title}</CardTitle>
        {first && !settingsOpen && (
          <button
            type="button"
            onClick={() => setOpen("settings")}
            className={linkButtonClass}
          >
            설정
          </button>
        )}
      </div>
      {head}
      {settingsForm ?? <Summary config={config} wallet={wallet} />}
      <DayTable
        wallet={wallet}
        settings={config}
        days={days}
        onSelectTab={onSelectTab}
      />
      <h4 className="text-sm font-medium">여행 전체 항목</h4>
      {extraList}
      {outsideExtras.length > 0 && (
        <>
          <h4 className="text-sm font-medium">여행 기간 밖 항목</h4>
          <ExtraList
            extras={outsideExtras}
            settings={config}
            open={open}
            setOpen={setOpen}
            addKey={null}
            addLabel={null}
            renderForm={renderForm}
          />
        </>
      )}
    </section>
  );
}

// 모임 카드는 지금 제목 그대로, 내 카드는 옆에 "나만 보여요".
function CardTitle({
  mine,
  children,
}: {
  mine: boolean;
  children: React.ReactNode;
}) {
  const h3 = <h3 className="font-semibold">{children}</h3>;
  if (!mine) return h3;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {h3}
      <PrivateBadge />
    </div>
  );
}

function money(minor: number, settings: CurrencySettings): string {
  return formatMoney(minor, settings.currency);
}

// 카드 머리(탑승권식, #53 설계 §5.5): 여행 전체 "예상 총지출 / 총 예산", 막대, 여유·초과. 두 탭 공통.
// 예산을 아직 정하지 않았거나(total null) 통화가 바뀐 내 예산(stale)이면 요약은 0 에 대해 계산된 것이라
// 막대·여유를 그리지 않고 예상 합계와 안내만 보인다(onSet 이 있으면 "… 예산 정하기" 버튼).
function BudgetHead({
  config,
  wallet,
  onSet,
}: {
  config: BudgetConfig;
  wallet: PanelWallet;
  onSet: (() => void) | null;
}) {
  const s = wallet.summary;
  const mine = wallet.side === "mine";
  if (wallet.total === null || wallet.stale) {
    const notice = wallet.stale
      ? `예산 통화가 바뀌었어요. 내 예산을 다시 정해 주세요 (전에 정한 값: ${formatMoney(wallet.stale.amount, wallet.stale.currency)})`
      : onSet
        ? null
        : mine
          ? "내 예산을 아직 정하지 않았어요."
          : "모임 예산을 아직 정하지 않았어요.";
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xl font-bold tabular-nums">
          {money(s.projected, config)}
          <span className="text-base font-semibold text-sub"> 예상</span>
        </p>
        {notice && <p className="text-sm text-sub">{notice}</p>}
        {onSet && (
          <button
            type="button"
            onClick={onSet}
            className={`self-start ${buttonClass("secondary", "small")}`}
          >
            {mine ? "내 예산 정하기" : "모임 예산 정하기"}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xl font-bold tabular-nums">
          {money(s.projected, config)}
          <span className="text-base font-semibold text-sub">
            {" "}
            / {money(s.total, config)}
          </span>
        </p>
        <p className="text-sm font-semibold">
          <BalanceText balance={s.balance} currency={config.currency} />
        </p>
      </div>
      <BudgetBar projected={s.projected} total={s.total} />
    </div>
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

// 예산을 정하지 않은 지갑(total null·stale)은 총 예산·여유 없이 합계만.
function Summary({
  config,
  wallet,
}: {
  config: BudgetConfig;
  wallet: PanelWallet;
}) {
  const settings = config;
  const s = wallet.summary;
  const hasTotal = wallet.total !== null && !wallet.stale;
  if (!s.hasActual) {
    // 예산 짜는 중: 계획 합계와 총 예산을 바로 비교한다.
    return (
      <div className="flex flex-col gap-1">
        {hasTotal && <Row label="총 예산">{money(s.total, settings)}</Row>}
        <Row label="계획 합계" strong>
          {money(s.planned, settings)}
          {hasTotal && (
            <>
              {" "}
              ·{" "}
              <BalanceText
                balance={s.total - s.planned}
                currency={settings.currency}
              />
            </>
          )}
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
      {hasTotal && <Row label="총 예산">{money(s.total, settings)}</Row>}
      <Row label="예상 총지출" strong>
        {money(s.projected, settings)}
        {hasTotal && (
          <>
            {" "}
            · <BalanceText balance={s.balance} currency={settings.currency} />
          </>
        )}
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

function amountOrDash(minor: number, has: boolean, settings: CurrencySettings) {
  return has ? money(minor, settings) : "—";
}

function DayTable({
  wallet,
  settings,
  days,
  onSelectTab,
}: {
  wallet: PanelWallet;
  settings: CurrencySettings;
  days: TripDay[];
  onSelectTab: (tab: string) => void;
}) {
  const { periods } = wallet;
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
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${lineClass(d.dayNumber, "bg")}`}
                  />
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
  settings: CurrencySettings;
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
  settings: CurrencySettings;
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
  addKey,
  addLabel,
  renderForm,
}: {
  extras: PanelExtra[];
  settings: CurrencySettings;
  open: OpenForm;
  setOpen: (key: OpenForm) => void;
  // 넣기 양식의 열림 키(카드마다 다름). null 이면 추가 버튼 없음.
  addKey: string | null;
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
      {addKey === null || addLabel === null ? null : open === addKey ? (
        renderForm(null)
      ) : (
        <button
          type="button"
          onClick={() => setOpen(addKey)}
          className={linkButtonClass}
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}
