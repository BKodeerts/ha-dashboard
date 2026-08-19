import { useHass } from '../../ha/HassProvider';
import { formatNumber, friendlyName, numericState } from '../../ha/selectors';

/**
 * A title and a one-line state. The subtitle is built from whatever `car`
 * names in the config — with nothing set it falls back to the entity count,
 * rather than inventing readings.
 */
export function CarView() {
  const { config, entities } = useHass();
  const { name, battery, range } = config.car;

  const batteryState = battery ? entities[battery] : undefined;
  const rangeState = range ? entities[range] : undefined;
  const rangeUnit = String(rangeState?.attributes?.unit_of_measurement ?? 'km');

  const title = name ?? (battery ? friendlyName(entities, battery) : 'Auto');

  const subtitle = [
    numericState(batteryState) === undefined
      ? undefined
      : `${formatNumber(numericState(batteryState))}%`,
    numericState(rangeState) === undefined
      ? undefined
      : `${formatNumber(numericState(rangeState))} ${rangeUnit}`,
  ].filter(Boolean);

  return (
    <div className="view">
      <div>
        <div className="view__title">{title}</div>
        <div className="view__sub">
          {subtitle.length > 0 ? subtitle.join(' · ') : 'stel car.battery en car.range in'}
        </div>
      </div>
    </div>
  );
}
