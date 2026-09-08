export async function GET() {
  const base = { status: 'ok', service: 'coco-garden-operations', version: '0.1.0' };
  const provider = process.env.DB_PROVIDER;

  if (!provider) return Response.json(base);

  try {
    if (provider === 'mongo') {
      const { pingMongo } = await import('../../../lib/db/mongo');
      await pingMongo();
      return Response.json({ ...base, db: 'mongo', dbStatus: 'connected' });
    }

    return Response.json({ ...base, db: provider, dbStatus: 'unknown-provider' });
  } catch (err) {
    return new Response(JSON.stringify({ ...base, db: provider, dbStatus: 'error', error: String(err) }), { status: 500 });
  }
}
