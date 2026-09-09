import { withAudit } from '../../../../lib/audit';
import mongoose from 'mongoose';
import User from '../../../../lib/models/User';
import { normalizeRole } from '../../../../lib/auth';
import { hashPassword } from '../../../../lib/passwords';
import { requireAdmin, readBody, validateAccount, userResponse, userFields, UserError } from '../../../../lib/user-management';

type Context = { params: Promise<{id:string}> };
async function target(context: Context, restaurantId: string) {
  const {id} = await context.params;
  if (!mongoose.isValidObjectId(id)) throw new UserError('Identifiant utilisateur invalide.');
  const user = await User.findOne({_id:id,restaurantId,deletedAt:null});
  if (!user) throw new UserError('Utilisateur introuvable.',404);
  return user;
}
async function handleGET(_request: Request, context: Context) {
  return userResponse(async () => {
    const session=await requireAdmin(); const user=await target(context,session.restaurantId);
    return Response.json(await User.findById(user._id).select(userFields).lean());
  });
}
async function handlePATCH(request: Request, context: Context) {
  return userResponse(async () => {
    const session=await requireAdmin(); const user=await target(context,session.restaurantId);
    const body=await readBody(request);
    if (user.authType === 'api_token') {
      if (body.login !== undefined || body.role !== undefined || body.password !== undefined) throw new UserError('Pour cet agent, seuls le nom et le statut sont modifiables.');
    }
    validateAccount(body);
    if (user.login === session.login && ((body.login !== undefined && body.login !== user.login) || body.active === false || (body.role !== undefined && body.role !== 'admin'))) throw new UserError('Vous ne pouvez pas changer votre identifiant, retirer vos droits administrateur ou désactiver votre propre compte.');
    if (user.active && normalizeRole(user.role) === 'admin' && (body.active === false || (body.role !== undefined && body.role !== 'admin')) && await User.countDocuments({restaurantId:session.restaurantId,active:true,deletedAt:null,role:{$in:['admin','manager']}}) <= 1) throw new UserError('Conservez au moins un administrateur actif.');
    if (body.login !== undefined && await User.exists({restaurantId:session.restaurantId,login:body.login,_id:{$ne:user._id}})) throw new UserError('Cet identifiant est déjà utilisé.',409);
    const changes: Record<string,unknown> = {};
    for (const key of ['name','login','role','active']) if (body[key] !== undefined) changes[key] = key === 'name' ? body.name.trim() : body[key];
    if (body.password) changes.passwordHash=hashPassword(body.password);
    const invalidate = Boolean(body.password || (body.login !== undefined && body.login !== user.login) || body.active === false);
    await User.updateOne({_id:user._id,restaurantId:session.restaurantId},{$set:changes,...(invalidate ? {$inc:{sessionVersion:1}} : {})});
    return Response.json(await User.findById(user._id).select(userFields).lean());
  });
}
async function handleDELETE(_request: Request, context: Context) {
  return userResponse(async () => {
    const session=await requireAdmin(); const user=await target(context,session.restaurantId);
    if (user.login === session.login) throw new UserError('Vous ne pouvez pas supprimer votre propre compte.');
    if (user.active && normalizeRole(user.role) === 'admin' && await User.countDocuments({restaurantId:session.restaurantId,active:true,deletedAt:null,role:{$in:['admin','manager']}}) <= 1) throw new UserError('Conservez au moins un administrateur actif.');
    await User.updateOne({_id:user._id,restaurantId:session.restaurantId},{$set:{active:false,deletedAt:new Date()},$inc:{sessionVersion:1}});
    return new Response(null,{status:204});
  });
}

export const GET = withAudit("GET /api/users/[id]", handleGET);
export const PATCH = withAudit("PATCH /api/users/[id]", handlePATCH);
export const DELETE = withAudit("DELETE /api/users/[id]", handleDELETE);
