// Two tokens reach a floor and they are not interchangeable: a service token may read any visit, a visit token only its own. Branding them keeps one from being passed where the other belongs.

declare const tokenKind: unique symbol;

export type ServiceToken = string & { readonly [tokenKind]: "service" };
export type VisitToken = string & { readonly [tokenKind]: "visit" };

export function serviceToken(raw: string): ServiceToken {
  return raw as ServiceToken;
}

/** A visit token comes from that visit's brief, and stops being accepted when the visit reports. */
export function visitToken(raw: string): VisitToken {
  return raw as VisitToken;
}
