import mongoose, { Schema, model } from 'mongoose';
const schema = new Schema({
  restaurantId: {type:String,required:true},
  actor: {type:String,required:true,maxlength:64},
  actorType: {type:String,enum:['management','whatsapp_agent','unverified_agent','anonymous'],required:true},
  operation: {type:String,required:true,maxlength:120},
  status: {type:Number,required:true},
  result: {type:String,enum:['success','denied','failure'],required:true},
  occurredAt: {type:Date,required:true,default:Date.now},
}, {versionKey:false,strict:'throw'});
schema.index({restaurantId:1,occurredAt:-1});
schema.index({restaurantId:1,result:1,occurredAt:-1});
schema.index({occurredAt:1},{expireAfterSeconds:90*24*60*60});
export default mongoose.models.AuditEvent || model('AuditEvent',schema);
