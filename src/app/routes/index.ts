// src/app/routes/index.ts
import { Router } from 'express';
import { AuthRoutes } from '../modules/Auth/auth.route';
import { ResearchPaperRoutes } from '../modules/ResearchPaper/ResearchPaper.route';
import { CourseRouter } from '../modules/Course/Course.router';
import { eventRouter } from '../modules/Event/event.router';
import { blogRouter } from '../modules/Blog/blog.router';
import { UserRoutes } from '../modules/user/user.route';
import { CategoryRouter } from '../modules/Category/Category.router';
import { BlogCategoryRouter } from '../modules/BlogCategory/BlogCategory.router';
import { AchievementRoutes } from '../modules/Achievement/achievement.router';
import { InternationalConferenceRoutes } from '../modules/InternationalConference/internationalConference.router';
import { ContactRoutes } from '../modules/Contact/contact.router';



import { PaymentRoutes } from '../modules/Payment/payment.routes';

const router = Router();
const moduleRoutes = [
  {
    path: '/auth',
    route: AuthRoutes,
  },
  {
    path: '/users',
    route: UserRoutes,
  },
  {
    path: '/paper',
    route: ResearchPaperRoutes,
  },
  {
    path: '/course',
    route: CourseRouter,
  },
  {
    path: '/event',
    route: eventRouter,
  },
  {
    path: '/blog',
    route: blogRouter,
  },
  {
    path: '/category',
    route: CategoryRouter,
  },
  {
    path: '/blog-category',
    route: BlogCategoryRouter,
  },
  {
    path: '/achievement',
    route: AchievementRoutes,
  },
  {
    path: '/international-conference',
    route: InternationalConferenceRoutes,
  },
  {
    path: '/contact',
    route: ContactRoutes,
  },
  {
  path: '/payment-admin',
  route: PaymentRoutes,
},
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
