const allowedTools = new Set(['get_server_time', 'get_status', 'explain_limitations']);

export async function runApprovedDemoTool(plan) {
  if (!allowedTools.has(plan.tool)) {
    throw new Error('Tool is not allowlisted');
  }

  switch (plan.tool) {
    case 'get_server_time':
      return { message: `সার্ভারের সময়: ${new Date().toLocaleString()}` };
    case 'get_status':
      return { message: 'JARVIS server is running.' };
    default:
      return {
        message: 'এটি এখন প্রাথমিক Demo Agent। বাস্তব ডিভাইস নিয়ন্ত্রণ যুক্ত করার আগে নির্দিষ্ট অনুমতি ও নিরাপত্তা ব্যবস্থা তৈরি করতে হবে।'
      };
  }
}
