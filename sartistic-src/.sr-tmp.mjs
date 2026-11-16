const base = "https://apiv2.shiprocket.in/v1/external";
const login = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD }) });
const { token } = await login.json();
const j = await (await fetch(`${base}/settings/company/pickup`, { headers: { Authorization: `Bearer ${token}` } })).json();
for (const l of j?.data?.shipping_address ?? [])
  console.log({ name: l.pickup_location, address: l.address, address_2: l.address_2, city: l.city, state: l.state, pin: l.pin_code });
