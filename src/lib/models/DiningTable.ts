import mongoose,{Schema} from 'mongoose';
const schema=new Schema({restaurantId:{type:String,required:true},number:{type:Number,required:true,min:1},name:{type:String,required:true},capacity:{type:Number,required:true,min:1},active:{type:Boolean,default:true}},{timestamps:true});
schema.index({restaurantId:1,number:1},{unique:true});
export default mongoose.models.DiningTable||mongoose.model('DiningTable',schema);
