import { withAudit } from '../../../lib/audit';
import User from '../../../lib/models/User';
import { hashPassword } from '../../../lib/passwords';
import { requireAdmin, readBody, validateAccount, userResponse, userFields, UserError } from '../../../lib/user-management';

async function handleGET() {
  return userResponse(async () => {
    const session = await requireAdmin();
    return Response.json(await User.find({ restaurantId: session.restaurantId, deletedAt: null }).select(userFields).sort({ active:-1, name:1 }).lean());
  });
}
async function handlePOST(request: Request) {
  return userResponse(async () => {
    const session = await requireAdmin();
    const body = await readBody(request);
    validateAccount(body, true);
    if (await User.exists({restaurantId:session.restaurantId,login:body.login})) throw new UserError('Cet identifiant est déjà utilisé.',409);
    const user = await User.create({restaurantId:session.restaurantId,login:body.login,name:body.name.trim(),passwordHash:hashPassword(body.password),role:body.role || 'serveur',active:body.active ?? true});
    return Response.json(await User.findById(user._id).select(userFields).lean(),{status:201});
  });
}

export const GET = withAudit("GET /api/users", handleGET);
export const POST = withAudit("POST /api/users", handlePOST);
