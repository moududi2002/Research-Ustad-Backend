/* eslint-disable @typescript-eslint/no-this-alias */
import bcrypt from 'bcrypt';
import { Schema, model } from 'mongoose';
import config from '../../config';
import { UserStatus } from './user.constant';
import { TUser, UserModel } from './user.interface';

const userSchema = new Schema<TUser, UserModel>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      select: 0,
    },
    needsPasswordChange: {
      type: Boolean,
      default: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: false,
      default:
        'https://www.shutterstock.com/image-vector/default-avatar-profile-icon-social-600nw-1906669723.jpg',
    },
    passwordChangedAt: {
      type: Date,
    },
    designation: {
      type: String,
      required: true,
      maxlength: 50,
    },
    status: {
      type: String,
      enum: UserStatus,
      default: 'in-progress',
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'user', 'superAdmin'],
        message: "Status must be either 'admin' or 'user'",
      },
      default: 'user',
    },
    isLoggedIn: {
      type: Boolean,
      default: false,
    },

    // Research member specific fields (consolidated)
    contactNo: { type: String, default: '' },
    current: {
      institution: { type: String, default: '' },
      department: { type: String, default: '' },
      inst_designation: { type: String, default: '' },
    },
    CurrentInstitutionAcademic: {
      institution: { type: String, default: '' },
      department: { type: String, default: '' },
      degree: { type: String, default: '' },
      status: { type: String, enum: ['Ongoing', 'Completed'], default: 'Ongoing' },
    },
    research: [{ type: String }],
    shortBio: { type: String, default: '' },
    aboutYourSelf: { type: String, default: '' },
    citations: { type: Number, default: 0 },
    socialLinks: {
      researchgate: { type: String, default: '' },
      google_scholar: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      orcid: { type: String, default: '' },
      portfolio: { type: String, default: '' },
    },
    expertise: [{ type: String, default: [] }],
    awards: [{ type: String, default: [] }],
    conferences: [
      {
        name: { type: String, default: '' },
        role: { type: String, default: '' },
        topic: { type: String, default: '' },
      },
    ],

    // Publications array to track user's authored papers
    publications: [{ type: Schema.Types.ObjectId, ref: 'ResearchPaper' }],
    
    // Blogs array to track user's authored blogs
    blogs: [{ type: Schema.Types.ObjectId, ref: 'Blog' }],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
  },
);

userSchema.pre('save', async function (next) {
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const user = this; // doc
  
  // Only hash the password if it has been modified (or is new)
  if (!user.isModified('password')) return next();
  
  // hashing password and save into DB
  user.password = await bcrypt.hash(
    user.password,
    Number(config.bcrypt_salt_rounds),
  );
  next();
});

userSchema.post('save', function (doc, next) {
  doc.password = '';
  next();
});

userSchema.statics.isUserExistsByCustomId = async function (email: string) {
  return await User.findOne({ email }).select('+password');
};

userSchema.statics.isPasswordMatched = async function (
  plainTextPassword: string,
  hashedPassword: string,
) {
  return await bcrypt.compare(plainTextPassword, hashedPassword);
};

userSchema.statics.isJWTIssuedBeforePasswordChanged = function (
  passwordChangedTimestamp: Date,
  jwtIssuedTimestamp: number,
) {
  const passwordChangedTime = new Date(passwordChangedTimestamp).getTime() / 1000;
  return passwordChangedTime > jwtIssuedTimestamp;
};

export const User = model<TUser, UserModel>('User', userSchema);
