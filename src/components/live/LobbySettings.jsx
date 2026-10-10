import { Switch } from '../ui/switch';

const ROWS = [
  { key: 'streakBonus', title: 'Streak bonus', body: 'Every right answer in a row adds 10% more points, up to 50%.' },
  { key: 'powerUps', title: 'Power-ups', body: 'Each player gets one 50/50 and one double points to use any time.' },
  { key: 'shuffle', title: 'Shuffle questions', body: 'Play the questions in a random order, the same for everyone.' },
  { key: 'lockOnStart', title: 'Lock when started', body: 'Nobody can join once the first question begins.' },
];

/**
 * The switches a host can flip before starting. Each one is written to the session as it is
 * changed, so players who have already joined see the rules the game will actually use.
 * Greyed out once the game starts, because changing the rules mid game would be unfair.
 */
export default function LobbySettings({ settings, onChange, disabled = false }) {
  return (
    <ul className="divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
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
