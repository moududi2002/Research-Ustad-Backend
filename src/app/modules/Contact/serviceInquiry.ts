import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import httpStatus from 'http-status';
import validateRequest from '../../middlewares/validateRequest';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { sendEmail } from '../../utils/sendEmail';
import config from '../../config';

const serviceNames = {
  'one-to-one-mentorship': 'One-to-One Mentorship & Support',
  'research-group-support': 'Research Group Support',
  'lab-report-writing': 'Lab Report Writing',
  'academic-project-support': 'Academic Project Support',
  'thesis-writing': 'Thesis Writing & Research Guidance',
  'thesis-defence': 'Thesis Defence Preparation',
  'paper-writing': 'Academic & Research Paper Writing',
  'journal-publication': 'Journal Publication Support',
  'premium-paper-access': 'Premium Paper Access',
} as const;

const serviceIds = [
  'one-to-one-mentorship', 'research-group-support',
  'lab-report-writing', 'academic-project-support',
  'thesis-writing', 'thesis-defence', 'paper-writing',
  'journal-publication', 'premium-paper-access',
] as const;

const inquiryBodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  university: z.string().trim().min(2).max(150),
  department: z.string().trim().min(2).max(120),
  academicLevel: z.enum([
    'Undergraduate', 'Masters', 'MPhil', 'PhD',
    'Postdoctoral', 'Faculty / Researcher', 'Other',
  ]),
  service: z.enum(serviceIds),
  details: z.string().trim().min(20).max(3000),
  contactNumber: z.string().trim().max(30).optional(),
  // Invisible honeypot: legitimate users leave this empty.
  website: z.literal('').optional(),
});

const inquirySchema = z.object({ body: inquiryBodySchema });

const escapeHtml = (value: string): string => {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (char) => entities[char]);
};

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many inquiries. Please try again later.',
  },
});

export const serviceInquiryRouter = Router();

serviceInquiryRouter.post(
  '/',
  limiter,
  validateRequest(inquirySchema),
  catchAsync(async (req, res) => {
    // Parse again so trimmed / validated values are used in the email.
    const data = inquiryBodySchema.parse(req.body);
    const to = config.email_user;
    if (!to) throw new Error('EMAIL_USER is not configured');

    const label = serviceNames[data.service];
    const lines = [
      ['Name', data.name],
      ['Email', data.email],
      ['University / Institution', data.university],
      ['Department', data.department],
      ['Academic level', data.academicLevel],
      ['Requested service', label],
      ['WhatsApp / Phone', data.contactNumber || 'Not provided'],
      ['Requirements', data.details],
    ];

    const rows = lines.map(([key, value]) => `
      <tr>
        <td style="padding:12px 16px;background:#f1f5f9;font-weight:700;vertical-align:top;border-bottom:1px solid #e2e8f0;width:34%">${escapeHtml(key)}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(value)}</td>
      </tr>
    `).join('');

    const html = `
      <!doctype html>
      <html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;color:#102a43">
        <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden">
          <div style="padding:28px;background:#083b57;color:#fff">
            <h1 style="font-size:24px;margin:0">New Service Inquiry</h1>
            <p style="margin:8px 0 0">Research Ustad • Our Services</p>
          </div>
          <div style="padding:24px">
            <p>A visitor submitted the service inquiry form.</p>
            <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
            <p style="margin-top:24px"><a href="mailto:${escapeHtml(data.email)}" style="background:#087b55;color:white;padding:12px 20px;text-decoration:none;border-radius:8px">Reply to Visitor</a></p>
            <p style="color:#64748b;font-size:12px;margin-top:28px">Submitted at: ${new Date().toISOString()}</p>
          </div>
        </div>
      </body></html>
    `;

    // Do NOT swallow failures: only report success after SMTP accepts the mail.
    await sendEmail(to, html, `Research Ustad Service Inquiry: ${label}`);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Service inquiry submitted successfully.',
      data: { success: true },
    });
  }),
);
