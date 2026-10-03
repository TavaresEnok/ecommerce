// Client identity set by the edge (Caddy). Server-side calls made by the web on behalf of a visitor forward it so the API
// rate limit counts that visitor, not the web process. The API only honours it with a valid X-Edge-Auth.
const EDGE_HEADERS=['x-client-ip','x-edge-auth'] as const;
export function edgeHeaders(source:Headers):Record<string,string>{const out:Record<string,string>={};for(const name of EDGE_HEADERS){const value=source.get(name);if(value)out[name]=value;}return out;}
