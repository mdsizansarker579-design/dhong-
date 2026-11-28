export function planTask(command) {
  const normalized = command.toLowerCase();

  if (normalized.includes('সময়') || normalized.includes('time')) {
    return {
      goal: 'সময় সম্পর্কে তথ্য দেখানো',
      steps: ['সার্ভারের বর্তমান সময় নেওয়া', 'ফলাফল দেখানো'],
      tool: 'get_server_time'
    };
  }

  if (normalized.includes('হেলথ') || normalized.includes('status') || normalized.includes('স্ট্যাটাস')) {
    return {
      goal: 'JARVIS সার্ভারের অবস্থা পরীক্ষা',
      steps: ['সার্ভারের স্বাস্থ্য পরীক্ষা', 'ফলাফল দেখানো'],
      tool: 'get_status'
    };
  }

  return {
    goal: 'কমান্ড বিশ্লেষণ করে পরবর্তী পদক্ষেপ সাজানো',
    steps: ['কমান্ড বোঝা', 'সম্ভাব্য কাজের পরিকল্পনা তৈরি', 'অনুমতি প্রয়োজন কি না যাচাই'],
    tool: 'explain_limitations'
  };
}
