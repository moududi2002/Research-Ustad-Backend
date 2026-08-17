import { z } from 'zod';

// Basic user validation schema
const createUserValidationSchema = z.object({
  body: z.object({
    password: z
      .string()
      .min(5, { message: 'Password must be at least 5 characters.' })
      .max(20, { message: 'Password cannot exceed 20 characters.' }),
    email: z.string().email({ message: 'Invalid email format.' }),
    fullName: z.string().min(1, { message: 'Full name is required.' }),
    designation: z.string().min(1, { message: 'Designation is required.' }),
    contactNo: z
      .string()
      .min(10, { message: 'Contact number must be at least 10 digits.' })
      .optional(),
    role: z.enum(['admin', 'user', 'superAdmin']).optional(),
  }),
});

// Research member creation with file upload
const createResearchMemberValidationSchema = z.object({
  body: z.object({
    password: z
      .string()
      .min(5, { message: 'Password must be at least 5 characters.' })
      .max(20, { message: 'Password cannot exceed 20 characters.' }),
    email: z.string().email({ message: 'Invalid email format.' }),
    fullName: z.string().min(1, { message: 'Full name is required.' }),
    designation: z.string().min(1, { message: 'Designation is required.' }),
    contactNo: z
      .string()
      .min(10, { message: 'Contact number must be at least 10 digits.' })
      .optional(),
    role: z.enum(['admin', 'user', 'superAdmin']).optional(),
    // Research member specific fields
    current: z
      .object({
        institution: z.string().optional(),
        department: z.string().optional(),
        inst_designation: z.string().optional(),
      })
      .optional(),
    CurrentInstitutionAcademic: z
      .object({
        institution: z.string().optional(),
        department: z.string().optional(),
        degree: z.string().optional(),
        status: z.enum(['Ongoing', 'Completed']).optional(),
      })
      .optional(),
    research: z.array(z.string()).optional(),
    shortBio: z.string().optional(),
    aboutYourSelf: z
      .string()
      .refine(
        (val) => {
          if (!val || val.trim() === '') return true;
          const wordCount = val
            .trim()
            .split(/\s+/)
            .filter((word) => word.length > 0).length;
          return wordCount <= 300;
        },
        { message: 'About yourself must be 300 words or less.' },
      )
      .optional(),
    socialLinks: z
      .object({
        google_scholar: z.string().optional(),
        researchgate: z.string().optional(),
        linkedin: z.string().optional(),
        orcid: z.string().optional(),
        portfolio: z.string().optional(),
      })
      .optional(),
    expertise: z.array(z.string()).optional(),
    awards: z.array(z.string()).optional(),
    conferences: z
      .array(
        z.object({
          name: z.string().optional(),
          role: z.string().optional(),
          topic: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

// Research member creation without file upload (JSON)
const createResearchMemberJsonValidationSchema = z.object({
  body: z.object({
    password: z
      .string()
      .min(5, { message: 'Password must be at least 5 characters.' })
      .max(20, { message: 'Password cannot exceed 20 characters.' }),
    email: z.string().email({ message: 'Invalid email format.' }),
    fullName: z.string().min(1, { message: 'Full name is required.' }),
    designation: z.string().min(1, { message: 'Designation is required.' }),
    contactNo: z
      .string()
      .min(10, { message: 'Contact number must be at least 10 digits.' })
      .optional(),
    role: z.enum(['admin', 'user', 'superAdmin']).optional(),
    image: z.string().optional(),
    // Research member specific fields
    current: z
      .object({
        institution: z.string().optional(),
        department: z.string().optional(),
        inst_designation: z.string().optional(),
      })
      .optional(),
    CurrentInstitutionAcademic: z
      .object({
        institution: z.string().optional(),
        department: z.string().optional(),
        degree: z.string().optional(),
        status: z.enum(['Ongoing', 'Completed']).optional(),
      })
      .optional(),
    research: z.array(z.string()).optional(),
    shortBio: z.string().optional(),
    aboutYourSelf: z
      .string()
      .refine(
        (val) => {
          if (!val || val.trim() === '') return true;
          const wordCount = val
            .trim()
            .split(/\s+/)
            .filter((word) => word.length > 0).length;
          return wordCount <= 300;
        },
        { message: 'About yourself must be 300 words or less.' },
      )
      .optional(),
    socialLinks: z
      .object({
        google_scholar: z.string().optional(),
        researchgate: z.string().optional(),
        linkedin: z.string().optional(),
        orcid: z.string().optional(),
        portfolio: z.string().optional(),
      })
      .optional(),
    expertise: z.array(z.string()).optional(),
    awards: z.array(z.string()).optional(),
    conferences: z
      .array(
        z.object({
          name: z.string().optional(),
          role: z.string().optional(),
          topic: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

// Update research member validation schema
const updateResearchMemberValidationSchema = z.object({
  body: z.object({
    fullName: z
      .string()
      .min(1, { message: 'Full name is required.' })
      .optional(),
    designation: z
      .string()
      .min(1, { message: 'Designation is required.' })
      .optional(),
    contactNo: z
      .string()
      .refine((val) => !val || val?.length === 0 || val?.length >= 10, {
        message: 'Contact number must be at least 10 digits or empty.',
      })
      .optional(),
    image: z.string().optional(),
    // Research member specific fields
    current: z
      .object({
        institution: z.string().optional(),
        department: z.string().optional(),
        inst_designation: z.string().optional(),
      })
      .optional(),
    CurrentInstitutionAcademic: z
      .object({
        institution: z.string().optional(),
        department: z.string().optional(),
        degree: z.string().optional(),
        status: z.enum(['Ongoing', 'Completed']).optional(),
      })
      .optional(),
    research: z.array(z.string()).optional(),
    shortBio: z.string().optional(),
    aboutYourSelf: z
      .string()
      .refine(
        (val) => {
          if (!val || val.trim() === '') return true;
          const wordCount = val
            .trim()
            .split(/\s+/)
            .filter((word) => word.length > 0).length;
          return wordCount <= 300;
        },
        { message: 'About yourself must be 300 words or less.' },
      )
      .optional(),
    socialLinks: z
      .object({
        google_scholar: z.string().optional(),
        researchgate: z.string().optional(),
        linkedin: z.string().optional(),
        orcid: z.string().optional(),
        portfolio: z.string().optional(),
      })
      .optional(),
    expertise: z.array(z.string()).optional(),
    awards: z.array(z.string()).optional(),
    conferences: z
      .array(
        z.object({
          name: z.string().optional(),
          role: z.string().optional(),
          topic: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

// User search validation schema
const searchUserValidationSchema = z.object({
  query: z.object({
    q: z
      .string()
      .min(2, { message: 'Search query must be at least 2 characters.' }),
  }),
});

// User role update validation schema
const updateUserRoleValidationSchema = z.object({
  params: z.object({
    id: z.string().min(1, { message: 'User ID is required.' }),
  }),
});

// Research member deletion validation schema
const deleteResearchMemberValidationSchema = z.object({
  params: z.object({
    id: z.string().min(1, { message: 'Research member ID is required.' }),
  }),
});

// SuperAdmin replacement validation schema
const replaceSuperAdminValidationSchema = z.object({
  body: z.object({
    newSuperAdminId: z
      .string()
      .min(1, { message: 'New superAdmin ID is required.' }),
  }),
});

export const UserValidation = {
  createUserValidationSchema,
  createResearchMemberValidationSchema,
  createResearchMemberJsonValidationSchema,
  updateResearchMemberValidationSchema,
  searchUserValidationSchema,
  updateUserRoleValidationSchema,
  deleteResearchMemberValidationSchema,
  replaceSuperAdminValidationSchema,
};
