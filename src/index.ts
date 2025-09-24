import axios from 'axios';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const config = {
  // 课程接口配置（需替换为实际选课系统的接口地址和参数）
  courseApi: process.env.COURSE_API || 'http://zhjw.scu.edu.cn/student/courseSelect/freeCourse/courseList', // 你的选课接口
  courseNames: (process.env.COURSE_NAMES ? process.env.COURSE_NAMES.split(',') : ['计算机网络']), // 多个课程名，逗号分隔
  cookie: process.env.COOKIE || 'student.urpSoft.cn=aaaZ8dPHwO1Bhggo0bVLz', // 你的 Cookie（可选）

  // 邮箱配置（推荐用 QQ 邮箱，需开启 SMTP 并获取授权码）
  email: {
    from: process.env.EMAIL_FROM || '2027595521@qq.com', // 发件人邮箱（如 QQ 邮箱）
    pass: process.env.EMAIL_PASS || 'aeihdrrfiqpifdbh', // 邮箱 SMTP 授权码（不是登录密码）
    to: process.env.EMAIL_TO || '2027595521@qq.com', // 收件人邮箱（可填自己）
  },
  checkInterval: Number(process.env.CHECK_INTERVAL) || 60 * 1000, // 检测间隔（默认60秒，单位毫秒）

  maxInterval: Number(process.env.MAX_INTERVAL) || 120 * 1000, // 最大间隔（单位：毫秒，随机间隔检测时生效）
  minInterval: Number(process.env.MIN_INTERVAL) || 30 * 1000, // 最小间隔（单位：毫秒，随机间隔检测时生效）
};

const headers = {
  'Accept': '*/*',
  'Accept-Encoding': 'gzip, deflate',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
  'Connection': 'keep-alive',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'Cookie': config.cookie,
  'Host': 'zhjw.scu.edu.cn',
  'Origin': 'http://zhjw.scu.edu.cn',
  'Referer': 'http://zhjw.scu.edu.cn/student/courseSelect/freeCourse/index?fajhh=10646&fj=0',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  'X-Requested-With': 'XMLHttpRequest'
}

class Course {
  name: string;
  quota: number;
  teacher: string;
  constructor(name: string, quota: number, teacher?: string) {
    this.name = name;
    this.quota = quota;
    this.teacher = teacher || '';
  }
}

function log(msg: string, type: 'info' | 'error' = 'info') {
  const time = new Date().toISOString();
  const line = `[${time}] ${type === 'error' ? '[ERROR]' : ''} ${msg}\n`;
  fs.appendFileSync('log.txt', line, { encoding: 'utf-8' });
  if (type === 'error') {
    console.error(msg);
  } else {
    console.log(msg);
  }
}

async function fetchCoursesMulti(courseNames: string[]) {
  let allCourses: Course[] = [];
  for (const name of courseNames) {
    try {
      log(`开始请求课程数据: ${name}`);
      const payload = new URLSearchParams({
        kkxsh: '',
        kch: '',
        kcm: name,
        skjs: '',
        xq: '0',
        jc: '0',
        kclbdm: '',
        vt: '',
        fj: '0'
      }).toString();
      const response = await axios.post(config.courseApi, payload, { headers });
      const data = response.data;
      if (!data || !data.rwRxkZlList) {
        log(`接口返回数据格式异常: ${name}`, 'error');
        continue;
      }
      log(`请求成功，开始处理数据: ${name}`);
      const list = data.rwRxkZlList || [];
      const courses: Course[] = list.map((item: any) => new Course(item.kcm, item.bkskyl, item.skjs))
        .filter((course: Course) => course.quota > 0);
      allCourses = allCourses.concat(courses);
    } catch (error) {
      log(`请求失败: ${name} - ` + error, 'error');
    }
  }
  return allCourses;
}

async function sendEmail(courses: Course[]) {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.qq.com', // QQ 邮箱 SMTP 服务器地址
      port: 465, // 465 是 SSL 端口
      secure: true, // 开启 SSL 加密
      auth: {
        user: config.email.from,
        pass: config.email.pass,
      },
    });

    const mailOptions = {
      from: `"选课提醒" <${config.email.from}>`, // 发件人名称+邮箱
      to: config.email.to, // 收件人邮箱（多个用逗号分隔）
      subject: `【选课通知】有课程有余量啦！`, // 邮件主题
      html: `
        <h3>课程余量检测结果</h3>
        ${courses.map(course => `
          <p>课程名：<span style="font-weight:bold">${course.name}</span></p>
          <p>教师：<span style="font-weight:bold">${course.teacher}</span></p>
          <p>当前余量：<span style="color:red; font-weight:bold">${course.quota}</span></p>
        `).join('<hr/>')}
        <p>请尽快登录选课系统操作！</p>
      `, // 邮件内容（支持 HTML）
    };

    await transporter.sendMail(mailOptions);
    log('邮件发送成功！');
    return true;

  } catch (error) {
    log('邮件发送失败：' + error, 'error');
    return false;
  }
}

async function test(){
 
}

const minInterval = Number(config.minInterval) || 30 * 1000; // 最小间隔30秒
const maxInterval = Number(config.maxInterval) || 120 * 1000; // 最大间隔120秒

async function runRandomInterval() {
  log(`🚀 选课检测脚本已启动！查询间隔范围：${minInterval / 1000} ~ ${maxInterval / 1000} 秒`);

  async function check() {
    try {
      const courses = await fetchCoursesMulti(config.courseNames);
      if (courses && courses.length > 0) {
        log(`🎉 检测到课程有余量：${courses.map(c => `${c.name}(${c.quota})`).join(', \r\n')}`);
        const res = await sendEmail(courses);
        if (res) {
          log('邮件发送成功！');
          return; // 检测到余量并发送邮件后停止
        }
      }
    } catch (error) {
      log('检测失败：' + error, 'error');
    }
    // 生成下次查询的随机间隔
    const nextInterval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
    log(`下次查询将在 ${nextInterval / 1000} 秒后进行...`);
    setTimeout(check, nextInterval);
  }

  check();
}

let timer: NodeJS.Timeout | null = null;

function run() {
  const minInterval = Number(process.env.MIN_INTERVAL) || 30 * 1000;
  const maxInterval = Number(process.env.MAX_INTERVAL) || 120 * 1000;

  const runOnce = async () => {
    try {
      const courses = await fetchCoursesMulti(config.courseNames);
    if (courses && courses.length > 0) {
      log(`🎉 检测到课程有余量：${courses.map(c => `${c.name}(${c.quota})`).join(', \r\n')}`);
      const res = await sendEmail(courses);
      if (res) {
        log('邮件发送成功！');
        return; // 检测到余量并发送邮件后停止
      }
    }
  } catch (error) {
    log('检测失败：' + error, 'error');
  }

  // 生成下次随机间隔
  const nextInterval = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
  log(`下次查询将在 ${nextInterval / 1000} 秒后进行...`);
    timer = setTimeout(runOnce, nextInterval);
  };

  runOnce();
}

async function runFixedInterval() {
  console.log(`🚀 选课检测脚本已启动！检测间隔：${config.checkInterval / 1000} 秒`);

  const check = setInterval(async() => {
    try {
      const courses = await fetchCoursesMulti(config.courseNames);
      if (courses && courses.length > 0) {
        console.log(`🎉 检测到课程有余量：${courses.map(c => `${c.name}(${c.quota})`).join(', \r\n')}`);
        const res = await sendEmail(courses);
        if(res){
          console.log('邮件发送成功！');
          clearInterval(check); // 发送邮件后停止检测
        }
      }
    }
    catch (error) {
      console.error('检测失败：', error);
    }
  }, config.checkInterval);
}

// 替换原来的 run() 调用
runRandomInterval();