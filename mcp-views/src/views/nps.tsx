import { formatDistance, formatNumber, useView } from "../shared";

type Route = {
  destination: string;
  destinationName?: string;
  distanceMetres?: number;
  surface?: { distanceMetres: number; headingDegrees: number; compass: string };
  error?: string;
};

/** La boussole : le cap à suivre, nord en haut. */
function Compass({ heading }: { heading: number }) {
  const { t } = useView();
  return (
    <svg
      className="compass"
      viewBox="-60 -60 120 120"
      role="img"
      aria-label={`${heading}°`}
    >
      <circle r="54" className="ring" />
      {t("nps.cardinals")
        .split(" ")
        .map((point, index) => {
          const angle = (index * Math.PI) / 2;
          return (
            <text
              key={point}
              x={Math.sin(angle) * 44}
              y={-Math.cos(angle) * 44 + 4}
              textAnchor="middle"
              className="cardinal"
            >
              {point}
            </text>
          );
        })}
      <g transform={`rotate(${heading})`}>
        <path d="M0 -38 L8 6 L0 0 L-8 6 Z" className="needle" />
      </g>
    </svg>
  );
}

/** Le relevé `/showlocation` (`nps_locate`) : position, lieux proches, cap. */
export function NpsView({ data }: { data: Record<string, unknown> }) {
  const { locale, t } = useView();
  const body = data.body as { name: string } | null;
  const geo = data.geo as {
    latitude: number;
    longitude: number;
    altitudeMetres: number;
  } | null;
  const nearest = (Array.isArray(data.nearest) ? data.nearest : []) as {
    slug: string;
    name: string;
    distanceMetres: number;
  }[];
  const route = data.route as Route | undefined;

  return (
    <section className="nps">
      <h1>{body ? t("nps.on", { body: body.name }) : t("nps.inSpace")}</h1>
      {geo && (
        <p className="meta">
          <span>
            {t("nps.latitude")} {formatNumber(locale, geo.latitude)}°
          </span>
          <span>
            {t("nps.longitude")} {formatNumber(locale, geo.longitude)}°
          </span>
          <span>
            {t("nps.altitude")} {formatDistance(locale, geo.altitudeMetres)}
          </span>
        </p>
      )}
      {route && (
        <div className="card route">
          {route.error ? (
            <p className="warn">{t("nps.noRoute")}</p>
          ) : (
            <>
              {route.surface && (
                <Compass heading={route.surface.headingDegrees} />
              )}
              <div>
                <h2>
                  {t("nps.to", {
                    name: route.destinationName ?? route.destination,
                  })}
                </h2>
                {route.surface && (
                  <p className="big">
                    {t("nps.heading", {
                      degrees: formatNumber(
                        locale,
                        route.surface.headingDegrees,
                      ),
                      compass: route.surface.compass,
                    })}
                  </p>
                )}
                {route.surface && (
                  <p>
                    {t("nps.ground", {
                      distance: formatDistance(
                        locale,
                        route.surface.distanceMetres,
                      ),
                    })}
                  </p>
                )}
                {route.distanceMetres !== undefined && (
                  <p className="muted">
                    {t("nps.straight", {
                      distance: formatDistance(locale, route.distanceMetres),
                    })}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {nearest.length > 0 && (
        <section>
          <h2>{t("nps.nearest")}</h2>
          <table>
            <tbody>
              {nearest.map((place) => (
                <tr key={place.slug}>
                  <td>{place.name}</td>
                  <td className="num">
                    {formatDistance(locale, place.distanceMetres)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}
