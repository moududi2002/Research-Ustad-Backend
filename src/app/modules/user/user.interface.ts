/* eslint-disable no-unused-vars */
import { Model, Types } from 'mongoose';
import { USER_ROLE } from './user.constant'

export interface TUser {
  _id: Types.ObjectId,
  email: string;
  password: string;
  needsPasswordChange: boolean;
  passwordChangedAt?: Date;
  designation: string; 
  status: 'in-progress' | 'blocked';
  role:"admin"|'user'|'superAdmin';
  isLoggedIn?: boolean;

  fullName: string;
  image: string;
  
  // Research member specific fields (consolidated from ResearchMembar)
  contactNo?: string;
  current?: {
    institution?: string;
    department?: string;
    inst_designation?: string;
  };
  CurrentInstitutionAcademic?: {
    institution?: string;
    department?: string;
    degree?: string;
    status?: "Ongoing" | "Completed";
  };
  research?: string[];
  shortBio?: string;
  aboutYourSelf?: string;
  citations?: number;
  socialLinks?: {
    researchgate?: string;
    google_scholar?: string;
    linkedin?: string;
    orcid?: string;
    portfolio?: string;
  };
  expertise?: string[];
  awards?: string[];
  conferences?: Array<{
    name: string;
    role: string;
    topic: string;
  }>;
  
  // Publications array to track user's authored papers
  publications?: Types.ObjectId[];
  
  // Blogs array to track user's authored blogs
  blogs?: Types.ObjectId[];
}

export interface UserModel extends Model<TUser> {
  isUserExistsByCustomId(email: string): Promise<TUser>;
  isPasswordMatched(
    plainTextPassword: string,
    hashedPassword: string,
  ): Promise<boolean>;
  isJWTIssuedBeforePasswordChanged(
    passwordChangedTimestamp: Date,
    jwtIssuedTimestamp: number,
  ): boolean;
}

export type TUserRole = keyof typeof USER_ROLE;
