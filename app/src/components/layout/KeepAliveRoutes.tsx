import { useRef, type ComponentType, type ReactElement, type ReactNode } from "react";

type RouteWrap = {
  (element: ReactElement): ReactNode;
};

export type KeepAliveRoute = {
  path: string;
  Component: ComponentType;
  /** Se true, só casa pathname exato (ex.: /app/perfil vs /app/perfil/assinar-cartao). */
  exact?: boolean;
  wrap?: RouteWrap;
};

function matchRoute(pathname: string, routes: KeepAliveRoute[]) {
  const sorted = [...routes].sort((a, b) => b.path.length - a.path.length);
  return sorted.find((route) =>
    route.exact ? pathname === route.path : pathname === route.path || pathname.startsWith(`${route.path}/`),
  );
}

/** Mantém páginas já visitadas montadas (estado preservado) ao trocar abas do painel. */
export function KeepAliveRoutes({
  pathname,
  routes,
  prefetchPaths = [],
}: {
  pathname: string;
  routes: KeepAliveRoute[];
  prefetchPaths?: string[];
}) {
  const visited = useRef(new Set<string>(prefetchPaths));
  const active = matchRoute(pathname, routes);

  if (active) visited.current.add(active.path);

  return (
    <>
      {routes.map((route) => {
        if (!visited.current.has(route.path)) return null;

        const isActive = active?.path === route.path;
        let element = <route.Component />;
        if (route.wrap) element = route.wrap(element) as ReactElement;

        return (
          <div key={route.path} hidden={!isActive} className={isActive ? "contents" : undefined}>
            {element}
          </div>
        );
      })}
    </>
  );
}

export { matchRoute };
