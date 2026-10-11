import { Switch } from '../ui/switch';
import { TEAM_COUNTS } from '@/utils/liveScoring';

const ROWS = [
  { key: 'streakBonus', title: 'Streak bonus', body: 'Every right answer in a row adds 10% more points, up to 50%.' },
  { key: 'powerUps', title: 'Power-ups', body: 'Each player gets one 50/50 and one double points to use any time.' },
  { key: 'shuffle', title: 'Shuffle questions', body: 'Play the questions in a random order, the same for everyone.' },
  { key: 'lockOnStart', title: 'Lock when started', body: 'Nobody can join once the first question begins.' },
  { key: 'suddenDeath', title: 'Sudden death', body: 'A wrong answer knocks a player out. The last one standing wins. Cannot be used with teams.' },
];

/**
 * The switches a host can flip before starting. Each one is written to the session as it is
 * changed, so players who have already joined see the rules the game will actually use.
 * Greyed out once the game starts, because changing the rules mid game would be unfair.
 */
export default function LobbySettings({ settings, onChange, disabled = false }) {
  const teams = Number(settings?.teams) || 0;
  return (
    <ul className="divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
      {/* Teams are a choice of how many, not an on or off, so they get a small row of buttons. */}
      <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
        <div className="min-w-0">
          <p id="setting-teams-label" className="text-base font-medium">Teams</p>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">Players are split into teams. A team scores the average of its players. Cannot be used with sudden death.</p>
        </div>
        <div role="radiogroup" aria-labelledby="setting-teams-label" className="flex gap-1.5">
          {[0, ...TEAM_COUNTS].map((n) => (
            <button
              key={n} type="button" role="radio" aria-checked={teams === n} disabled={disabled}
              onClick={() => onChange({ teams: n })}
              className={`h-9 min-w-11 cursor-pointer rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${teams === n ? 'border-[hsl(var(--ink))] bg-[hsl(var(--ink))] text-[hsl(var(--ink-foreground))]' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'}`}
            >
              {n === 0 ? 'Off' : n}
            </button>
          ))}
        </div>
      </li>
      {ROWS.map(({ key, title, body }) => (
        <li key={key} className="flex items-center justify-between gap-6 py-4">
          <div className="min-w-0">
            <label htmlFor={`setting-${key}`} className="text-base font-medium">{title}</label>
            <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{body}</p>
          </div>
          <Switch id={`setting-${key}`} label={title} checked={!!settings?.[key]} disabled={disabled} onCheckedChange={(value) => onChange({ [key]: value })} />
        </li>
      ))}
    </ul>
  );
}
