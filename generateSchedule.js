// 全局變量
let dayShiftCount, eveningShiftCount, nightShiftCount;
let daysInMonth;

if (typeof SHIFTS === 'undefined') {
    // 定義班次常量
    const SHIFTS = {
        DAY: 'DAY',
        EVENING: 'EVENING',
        NIGHT: 'NIGHT'
    };
}

if (typeof SHIFT_DISPLAY === 'undefined') {
    // 定義班次顯示名稱
    const SHIFT_DISPLAY = {
        [SHIFTS.DAY]: '白班',
        [SHIFTS.EVENING]: '小夜',
        [SHIFTS.NIGHT]: '大夜'
    };
}



const POPULATION_SIZE = 50;
const MAX_GENERATIONS = 100;  // 增加到 500
const CROSSOVER_RATE = 0.8;
const MUTATION_RATE = 0.02;  // 稍微增加變異率
const ELITISM_COUNT = 2;



function calculateExpectedShiftDays() {
    const totalShiftsPerDay = dayShiftCount + eveningShiftCount + nightShiftCount;
    const totalShiftsInMonth = daysInMonth * totalShiftsPerDay;
    const expectedShiftsPerStaff = Math.floor(totalShiftsInMonth / staffList.length);

    staffList.forEach(staff => {
        staff.expectedShiftDays = expectedShiftsPerStaff;
    });

    // 處理除不盡的情況，將剩餘的班次平均分配
    const remainingShifts = totalShiftsInMonth % staffList.length;
    for (let i = 0; i < remainingShifts; i++) {
        staffList[i].expectedShiftDays++;
    }

    console.log('預期班數已計算完成:', staffList.map(s => `${s.name}: ${s.expectedShiftDays}`));
}
function generateSchedule() {
    loadFromLocalStorage();
    console.log('Loaded staffList:', staffList);
    if (staffList.length === 0) {
        alert('沒有可用員工數據，請先添加員工。');
        return;
    }
    // 獲取用戶選擇的年份和月份
    const year = parseInt(document.getElementById("year").value);
    const month = parseInt(document.getElementById("month").value);
    daysInMonth = new Date(year, month, 0).getDate();
  
    // 獲取各班次所需人數
    dayShiftCount = parseInt(document.getElementById("dayShiftCount").value);
    eveningShiftCount = parseInt(document.getElementById("eveningShiftCount").value);
    nightShiftCount = parseInt(document.getElementById("nightShiftCount").value);
  
    // 計算預期班數
    calculateExpectedShiftDays();

    // 初始化種群
    let population = [];
    for (let i = 0; i < POPULATION_SIZE; i++) {
        population.push(createRandomSchedule());
    }
  
    // 運行遺傳算法
    let bestSchedule = null;
    let bestFitness = -Infinity;
  
    for (let generation = 0; generation < MAX_GENERATIONS; generation++) {
        console.log(`第 ${generation} 代`);
  
        // 評估種群中每個排班表的適應度
        let fitnessValues = population.map(evaluateScheduleFitness);
      
        // 檢查是否有新的最佳解  
        let bestIndex = fitnessValues.indexOf(Math.max(...fitnessValues));
        if (fitnessValues[bestIndex] > bestFitness) {
            bestSchedule = population[bestIndex];
            bestFitness = fitnessValues[bestIndex]; 
            console.log(`新的最佳適應度: ${bestFitness}`);
        }
  
        // 提前終止條件：如果找到幾乎完美的排班表，就提前結束
        if (bestFitness >= 99990) {  // 調整閾值，使其更嚴格
            console.log("找到近乎完美排班表，提前終止。");
            break;
        }
  
        // 選擇父代進行繁殖
        let parents = selectParents(population, fitnessValues);
  
        // 創建新一代種群
        let newPopulation = [];
  
        // 精英策略：保留最佳解
        for (let i = 0; i < ELITISM_COUNT; i++) {
            if (bestSchedule) {
                newPopulation.push(JSON.parse(JSON.stringify(bestSchedule)));
            }
        }
  
        // 通過交叉和變異生成新的排班表
        while (newPopulation.length < POPULATION_SIZE) {
            if (Math.random() < CROSSOVER_RATE) {
                // 執行交叉操作
                let [parent1, parent2] = getParentsFromSelected(parents);
                let [child1, child2] = crossover(parent1, parent2);
                newPopulation.push(child1, child2);
            } else {
                // 執行變異操作
                let parent = getRandomFromSelected(parents);
                let child = mutate(parent);  
                newPopulation.push(child);
            }
        }
  
        // 用新一代取代舊一代
        population = newPopulation;
    }
  
    console.log('最佳排班表:', bestSchedule);
    console.log('最佳適應度:', bestFitness);
    
    // 顯示最終的排班結果
    displaySchedule(bestSchedule, year, month);
    displayStatistics(bestSchedule);
    displayScheduleMatrix(bestSchedule, year, month);
}
function createRandomSchedule() {
    let schedule = {};
    for (let day = 1; day <= daysInMonth; day++) {
        schedule[day] = {
            [SHIFTS.DAY]: [],
            [SHIFTS.EVENING]: [],
            [SHIFTS.NIGHT]: []
        };
    }

    // 重置每個員工的實際排班數和連續工作天數
    staffList.forEach(staff => {
        staff.actualShiftDays = 0;
        staff.consecutiveWorkDays = 0;
    });

    // 先安排預排班
    schedulePrescheduledShifts(schedule);

    // 填補剩餘班次
    for (let day = 1; day <= daysInMonth; day++) {
        let remainingShifts = {
            [SHIFTS.DAY]: dayShiftCount - schedule[day][SHIFTS.DAY].length,
            [SHIFTS.EVENING]: eveningShiftCount - schedule[day][SHIFTS.EVENING].length,
            [SHIFTS.NIGHT]: nightShiftCount - schedule[day][SHIFTS.NIGHT].length
        };

        let availableStaff = getAvailableStaff(day, schedule);
        shuffleArray(availableStaff);

        for (let shift in SHIFTS) {
            while (remainingShifts[shift] > 0 && availableStaff.length > 0) {
                let staffIndex = availableStaff.findIndex(staff => 
                    isStaffAvailableForShift(staff, day, shift, schedule) &&
                    staff.actualShiftDays < staff.expectedShiftDays
                );

                if (staffIndex !== -1) {
                    let staff = availableStaff[staffIndex];
                    schedule[day][shift].push(staff.name);
                    staff.actualShiftDays++;
                    remainingShifts[shift]--;
                    staff.consecutiveWorkDays++;
                    availableStaff.splice(staffIndex, 1);
                } else {
                    break;  // 如果找不到合適的員工，跳出循環
                }
            }
        }

        // 更新沒有排班的員工的連續工作天數
        staffList.forEach(staff => {
            if (!isStaffScheduledOnDay(schedule, staff.name, day)) {
                staff.consecutiveWorkDays = 0;
            }
        });
    }

    return schedule;
}
function evaluateScheduleFitness(schedule) {
    let fitness = 100000;  // 從一個高分開始，然後根據違規情況扣分

    // 規則 1：所有班次都必須被填滿
    for (let day = 1; day <= daysInMonth; day++) {
        if (schedule[day][SHIFTS.DAY].length < dayShiftCount) fitness -= 1000;
        if (schedule[day][SHIFTS.EVENING].length < eveningShiftCount) fitness -= 1000;
        if (schedule[day][SHIFTS.NIGHT].length < nightShiftCount) fitness -= 1000;
    }

    // 規則 2：尊重預排班
    staffList.forEach(staff => {
        staff.prescheduledDates.forEach(preschedule => {
            let shiftStaff = schedule[preschedule.date][preschedule.shift];
            if (!shiftStaff.includes(staff.name)) {
                fitness -= 2000;  // 嚴重違規，扣更多分
            }
        });  
    });


    // 規則 3：實際排班數應接近預期排班數
    staffList.forEach(staff => {
        let actualShifts = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            if (isStaffScheduledOnDay(schedule, staff.name, day)) actualShifts++;
        }
        const difference = Math.abs(actualShifts - staff.expectedShiftDays);
        fitness -= difference * 500;  // 每差一個班次扣500分
    });

    // 規則 4：尊重班次偏好
    staffList.forEach(staff => {
        let staffShifts = new Set([staff.shift1, staff.shift2]);
        for (let day = 1; day <= daysInMonth; day++) {
            for (let shift in SHIFTS) {
                if (schedule[day][shift].includes(staff.name) && !staffShifts.has(shift)) {
                    fitness -= 50;
                }
            }
        }
    });

    // 規則 5：避免連續工作超過 6 天
    staffList.forEach(staff => {
        let consecutiveDays = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            if (isStaffScheduledOnDay(schedule, staff.name, day)) {
                consecutiveDays++;
                if (consecutiveDays > 6) {
                    fitness -= 200;  // 每多一天連續工作扣200分
                }
            } else {
                consecutiveDays = 0;
            }
        }
    });

    // 規則 6：避免不合理的班次安排（如白大白）
    for (let day = 2; day <= daysInMonth; day++) {
        staffList.forEach(staff => {
            let yesterdayShift = getStaffShiftOnDay(schedule, staff.name, day - 1);
            let todayShift = getStaffShiftOnDay(schedule, staff.name, day);
            if (yesterdayShift === SHIFTS.DAY && todayShift === SHIFTS.NIGHT) {
                fitness -= 300;  // 白班接大夜扣300分
            }
            if (day < daysInMonth) {
                let tomorrowShift = getStaffShiftOnDay(schedule, staff.name, day + 1);
                if (yesterdayShift === SHIFTS.DAY && todayShift === SHIFTS.NIGHT && tomorrowShift === SHIFTS.DAY) {
                    fitness -= 50000;  // 白大白情況扣50000分
                }
            }
        });
    }

    return fitness;
}
function selectParents(population, fitnessValues) {
    let parents = [];
    for (let i = 0; i < POPULATION_SIZE; i++) {
        let randomValue = Math.random() * fitnessValues.reduce((a, b) => a + b, 0);
        let sum = 0;
        for (let j = 0; j < POPULATION_SIZE; j++) {
            sum += fitnessValues[j];
            if (sum >= randomValue) {
                parents.push(population[j]);
                break;
            }
        }
    }
    return parents;
}
function crossover(parent1, parent2) {
    let child1 = JSON.parse(JSON.stringify(parent1)); 
    let child2 = JSON.parse(JSON.stringify(parent2));

    let crossoverPoint = Math.floor(Math.random() * daysInMonth) + 1;

    for (let day = crossoverPoint; day <= daysInMonth; day++) {
        [child1[day], child2[day]] = [child2[day], child1[day]];
    }

    return [child1, child2];
}
function mutate(schedule) {
    let mutatedSchedule = JSON.parse(JSON.stringify(schedule));

    for (let day = 1; day <= daysInMonth; day++) {
        for (let shift in SHIFTS) {
            if (Math.random() < MUTATION_RATE) {
                let staffToReplace = Math.floor(Math.random() * mutatedSchedule[day][shift].length);
                let availableStaff = getAvailableStaff(day, mutatedSchedule).filter(
                    staff => isStaffAvailableForShift(staff, day, shift, mutatedSchedule)
                );
                
                if (availableStaff.length > 0) {
                    let replacementStaff = availableStaff.reduce((min, staff) => 
                        ((staff.expectedShiftDays - staff.actualShiftDays) > (min.expectedShiftDays - min.actualShiftDays)) ? staff : min
                    );
                    mutatedSchedule[day][shift][staffToReplace] = replacementStaff.name;
                    replacementStaff.actualShiftDays++;
                    let removedStaff = staffList.find(staff => staff.name === schedule[day][shift][staffToReplace]);
                    if (removedStaff) removedStaff.actualShiftDays--;
                }
            }
        }
    }

    return mutatedSchedule;
}
function shuffleArray(array) {
    return array.sort(() => 0.5 - Math.random());
}
function isStaffScheduledOnNextDay(schedule, staffName, day) {
    if (day === daysInMonth) {
        return false;  // 最後一天的下一天就是下個月,所以返回false
    }
    return isStaffScheduledOnDay(schedule, staffName, day + 1);
}
function isStaffAvailableForShift(staff, day, shift, schedule) {
    if (isStaffScheduledOnDay(schedule, staff.name, day)) {
        return false;
    }

    if (staff.preVacationDates.includes(day)) {
        return false;
    }

    if ((staff.shift1 && shift !== staff.shift1) && (staff.shift2 && shift !== staff.shift2)) {
        return false;
    }

    // 檢查連續工作天數,包括上個月的情況
    if (staff.consecutiveWorkDays >= 6) {
        return false;
    }

    // 第一天的特殊處理
    if (day === 1) {
        if (staff.lastMonthLastDayShift) {
            // 確保第一天的班次與上月最後一天相同
            if (shift !== staff.lastMonthLastDayShift) {
                return false;
            }
            // 如果上個月最後六天已經連續工作了6天，第一天就不該再排班
            if (staff.previousMonthSchedules && staff.previousMonthSchedules.length >= 6) {
                return false;
            }
        }
    } else {
        let prevDay = day - 1;
        let prevDayShift = getStaffShiftOnDay(schedule, staff.name, prevDay);
        if ((prevDayShift === SHIFTS.EVENING && shift === SHIFTS.DAY) ||
            (prevDayShift === SHIFTS.NIGHT && (shift === SHIFTS.DAY || shift === SHIFTS.EVENING))) {
            return false;
        }
    }

    return true;
}
function isStaffScheduledOnDay(schedule, staffName, day) {
    return Object.values(schedule[day]).some(shift => shift.includes(staffName));
}
function getStaffWithLeastShifts(day, shift, schedule) {
    let availableStaff = getAvailableStaff(day, schedule);
    availableStaff = availableStaff.filter(staff => 
        (staff.shift1 === shift || staff.shift2 === shift) &&
        isStaffAvailableForShift(staff, day, shift, schedule)
    );
    
    if (availableStaff.length > 0) {
        return availableStaff.reduce((min, staff) => 
            (staff.actualShiftDays / staff.expectedShiftDays < min.actualShiftDays / min.expectedShiftDays) ? staff : min
        );
    }
    return null;
}
function getAvailableStaff(day, schedule) {
    return staffList.filter(staff => {
        const isScheduledOnDay = isStaffScheduledOnDay(schedule, staff.name, day);
        const hasPreVacationDates = staff.preVacationDates && staff.preVacationDates.includes(day);
        return !isScheduledOnDay && !hasPreVacationDates;
    });
}
function getStaffShiftOnDay(schedule, staffName, day) {
    for (let shift in schedule[day]) {
        if (schedule[day][shift].includes(staffName)) {
            return shift;
        }
    }
    return null;
}
function getShiftCount(shift) {
    switch(shift) {
        case SHIFTS.DAY: return dayShiftCount;
        case SHIFTS.EVENING: return eveningShiftCount;
        case SHIFTS.NIGHT: return nightShiftCount;
        default: return 0;
    }
}
function getRandomAvailableStaffWithLeastShifts(day, shift, schedule) {
    let availableStaff = getAvailableStaff(day, schedule);
    availableStaff = availableStaff.filter(staff => isStaffAvailableForShift(staff, day, shift, schedule));
    if (availableStaff.length > 0) {
        // 選擇實際排班數與預期排班數比例最小的人員
        return availableStaff.reduce((min, staff) => {
            const minRatio = min.expectedShiftDays ? min.actualShiftDays / min.expectedShiftDays : Infinity;
            const staffRatio = staff.expectedShiftDays ? staff.actualShiftDays / staff.expectedShiftDays : Infinity;
            return staffRatio < minRatio ? staff : min;
        });
    }
    return null;
}
function getRandomShift() {
    let shifts = [SHIFTS.DAY, SHIFTS.EVENING, SHIFTS.NIGHT];
    return shifts[Math.floor(Math.random() * shifts.length)];
}
function getRandomAvailableStaff(day, shift, schedule) {
    let availableStaff = getAvailableStaff(day, schedule);
    availableStaff = availableStaff.filter(staff => isStaffAvailableForShift(staff, day, shift, schedule));
    if (availableStaff.length > 0) {
        return availableStaff[Math.floor(Math.random() * availableStaff.length)];
    }
    return null;
}
function getParentsFromSelected(selectedParents) {
    let parent1 = selectedParents[Math.floor(Math.random() * selectedParents.length)];
    let parent2 = selectedParents[Math.floor(Math.random() * selectedParents.length)];
    return [parent1, parent2];
}
function getRandomFromSelected(selectedParents) {
    return selectedParents[Math.floor(Math.random() * selectedParents.length)];
}
function schedulePrescheduledShifts(schedule) {
    staffList.forEach(staff => {
        staff.prescheduledDates.forEach(prescheduled => {
            let { date, shift } = prescheduled;
            if (!schedule[date][shift].includes(staff.name)) {
                schedule[date][shift].push(staff.name);
                staff.actualShiftDays++;
            }
        });
    });
}
function displaySchedule(schedule, year, month) {
    const scheduleTable = document.getElementById('scheduleTable');
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    
    let tableHTML = `
        <table class="schedule-table">
            <thead>
                <tr>
                    <th>日期</th>
                    <th>星期</th>
                    <th>白班</th>
                    <th>小夜</th>
                    <th>大夜</th>
                </tr>
            </thead>
            <tbody>
    `;

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const weekday = weekdays[date.getDay()];
        
        tableHTML += `
            <tr>
                <td>${month}/${day}</td>
                <td>${weekday}</td>
                <td>${schedule[day][SHIFTS.DAY].join(', ')}</td>
                <td>${schedule[day][SHIFTS.EVENING].join(', ')}</td>
                <td>${schedule[day][SHIFTS.NIGHT].join(', ')}</td>
            </tr>
        `;
    }

    tableHTML += `
            </tbody>
        </table>
    `;

    scheduleTable.innerHTML = tableHTML;
}
function displayStatistics(schedule) {
    console.log('顯示統計資料時的 staffList:', JSON.stringify(staffList));
    const statisticsTable = document.getElementById('statisticsTable');
    
    let tableHTML = `
        <table class="statistics-table">
            <thead>
                <tr>
                    <th>員工名稱</th>
                    <th>預期班數</th>
                    <th>實際班數</th>
                    <th>白班天數</th>
                    <th>小夜天數</th>
                    <th>大夜天數</th>
                </tr>
            </thead>
            <tbody>
    `;

    staffList.forEach(staff => {
        const expectedDays = staff.expectedShiftDays || 0
        let actualDays = 0;
        let dayShiftDays = 0;
        let eveningShiftDays = 0;
        let nightShiftDays = 0;

        for (let day = 1; day <= daysInMonth; day++) {
            if (schedule[day][SHIFTS.DAY].includes(staff.name)) {
                dayShiftDays++;
                actualDays++;
            }
            if (schedule[day][SHIFTS.EVENING].includes(staff.name)) {
                eveningShiftDays++;
                actualDays++;
            }
            if (schedule[day][SHIFTS.NIGHT].includes(staff.name)) {
                nightShiftDays++;
                actualDays++;
            }
        }

        // 更新 staff 對象的 actualShiftDays
        staff.actualShiftDays = actualDays;

        tableHTML += `
            <tr>
                <td>${staff.name}</td>
                <td>${expectedDays}</td>
                <td>${actualDays}</td>
                <td>${dayShiftDays}</td>
                <td>${eveningShiftDays}</td>
                <td>${nightShiftDays}</td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    statisticsTable.innerHTML = tableHTML;
}
function displayScheduleMatrix(schedule, year, month) {
    const scheduleMatrixDiv = document.getElementById('scheduleMatrix');
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    
    let tableHTML = `
        <table class="schedule-matrix">
            <thead>
                <tr>
                    <th>人員 \ 日期</th>
    `;
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const weekday = weekdays[date.getDay()];
        tableHTML += `<th>${month}/${day}<br>(${weekday})</th>`;
    }
    
    tableHTML += `
                </tr>
            </thead>
            <tbody>
    `;
    
    staffList.forEach(staff => {
        tableHTML += `
            <tr>
                <td>${staff.name}</td>
        `;
        
        for (let day = 1; day <= daysInMonth; day++) {
            let shiftForDay = '';
            if (schedule[day][SHIFTS.DAY].includes(staff.name)) {
                shiftForDay = '白';
            } else if (schedule[day][SHIFTS.EVENING].includes(staff.name)) {
                shiftForDay = '小';
            } else if (schedule[day][SHIFTS.NIGHT].includes(staff.name)) {
                shiftForDay = '大';
            }
            tableHTML += `<td>${shiftForDay}</td>`;
        }
        
        tableHTML += `
            </tr>
        `;
    });
    
    tableHTML += `
            </tbody>
        </table>
    `;
    
    scheduleMatrixDiv.innerHTML = tableHTML;
}
document.addEventListener('DOMContentLoaded', function() {
    loadFromLocalStorage();
    let generateBtn = document.getElementById('generateScheduleBtn');
    generateBtn.addEventListener('click', generateSchedule);
});