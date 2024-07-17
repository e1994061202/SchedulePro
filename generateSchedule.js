// 全局變量
let dayShiftCount, eveningShiftCount, nightShiftCount;

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

// 全局變量
let iteration = 0;
let maxIterations = 1000000; // 最大迭代次數
let startTime;
let isFirstScheduleGeneration = true;
const expectedDuration = 60000; // 預期運行時間,單位毫秒 (這裡設置為60秒)
// 更新進度條
function updateProgress(progress) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${Math.round(progress)}%`;
}
function clearPreviousResults() {
    document.getElementById('scheduleMatrix').innerHTML = '';
    document.getElementById('scheduleTable').innerHTML = '';
    document.getElementById('statisticsTable').innerHTML = '';
}

// 主要的排班生成函數
async function generateSchedule() {
    try {
        console.log("Generating schedule...");

        // 清除之前的結果
        clearPreviousResults();

        // 顯示進度條並重置
        const progressDiv = document.getElementById('progressDiv');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        progressDiv.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';

        // 添加提示
        alert("排班過程已開始，請稍候。您可以在進度條中查看進度。");

        const year = parseInt(document.getElementById("year").value);
        const month = parseInt(document.getElementById("month").value);
        const daysInMonth = new Date(year, month, 0).getDate();

        if (dayShiftCount === 0 && eveningShiftCount === 0 && nightShiftCount === 0) {
            alert("請設置至少一個班次的人數！");
            progressDiv.style.display = 'none';
            return;
        }

        // 初始化排班表
        let schedule = initializeSchedule(daysInMonth, year, month);
        console.log("Initial schedule:", schedule);

        // 只有在第一次生成排班表時才打印能量值和各個懲罰項
        if (isFirstScheduleGeneration) {
            const initialEnergy = calculateEnergy(schedule, year, month);
            console.log("初始排班表能量值：", initialEnergy);

            // 打印各個懲罰項的計算結果
            console.log("----- 各項懲罰值 -----");
            console.log("班次覆蓋情況：", checkShiftCoverage(schedule) * 3000);
            console.log("偏好班次：", checkPreferredShiftsStrict(schedule) * 1000);
            console.log("孤立工作日：", checkIsolatedWorkDays(schedule) * 200);
            console.log("班次間休息時間：", checkRestBetweenShifts(schedule) * 200);
            console.log("月底預休集中：", checkMonthEndVacationPriority(schedule, year, month) * 50);
            console.log("預期班數未達標:", checkActualVsExpectedShifts(schedule) * 100000);
            console.log("超過連6:", checkConsecutiveWorkDays(schedule) * 100000);
            console.log("排班違規:", checkForbiddenShiftConnections(schedule) * 100000);
            console.log("預休違規:", checkPreVacationViolations(schedule) * 100000);
            
            

            // 將 isFirstScheduleGeneration 設置為 false，避免下次再打印
            isFirstScheduleGeneration = false;
        }

        // 執行異步模擬退火算法
        const finalSchedule = await asyncSimulatedAnnealing(schedule, year, month);
        console.log("Final schedule after simulated annealing:", finalSchedule);

        // 更新每個員工的實際排班天數
        staffList.forEach(staff => {
            staff.actualShiftDays = calculateActualShiftDays(staff, finalSchedule);
        });

        // 檢查每個人的實際班次數
        let shiftCountMismatch = checkActualVsExpectedShifts(finalSchedule);

        // 執行最終檢查
        const violations = finalScheduleCheck(finalSchedule);
        console.log("Final schedule check results:", violations);

        if (violations.length === 0 && shiftCountMismatch === 0) {
            console.log("The generated schedule meets all constraints.");
            alert("排班表生成成功，並滿足所有約束條件！");
        } else {
            console.warn("Warning: The generated schedule has some violations or mismatches.");
            alert("排班表生成完成，但存在一些違規情況或班次不匹配。請查看控制台日誌以獲取詳細信息，並考慮手動調整。");
            violations.forEach(v => console.error(v));
            if (shiftCountMismatch > 0) {
                console.error(`Shift count mismatch: ${shiftCountMismatch}`);
            }
        }

        // 顯示最終排班表
        displaySchedule(finalSchedule, year, month);
        displayStatistics(finalSchedule);
        displayScheduleMatrix(finalSchedule, year, month);

        // 隱藏進度條
        progressDiv.style.display = 'none';
    } catch (error) {
        console.error("Error during schedule generation:", error);
        alert("生成排班表時發生錯誤，請查看控制台日誌以獲取詳細信息。");
        document.getElementById('progressDiv').style.display = 'none';
    }
}
// 初始化排班表
function initializeSchedule(daysInMonth, year, month) {
    let schedule = {};
    for (let day = 1; day <= daysInMonth; day++) {
        schedule[day] = {
            [SHIFTS.DAY]: [],
            [SHIFTS.EVENING]: [],
            [SHIFTS.NIGHT]: []
        };
    }

    // 先填充預排班
    staffList.forEach(staff => {
        staff.prescheduledDates.forEach(preSchedule => {
            if (preSchedule.date <= daysInMonth &&
                !isPreVacationDay(staff, preSchedule.date) &&
                schedule[preSchedule.date][preSchedule.shift].length < getRequiredStaffForShift(preSchedule.shift)) {
                schedule[preSchedule.date][preSchedule.shift].push(staff.name);
            }
        });
    });

    // 為其他員工分配剩餘的班次
    assignRemainingShifts(schedule, daysInMonth);

    // 檢查和修正月底預休人員的排班數
    checkAndFixEndOfMonthVacations(schedule, daysInMonth, year, month);
    
    return schedule;
}
function checkAndFixEndOfMonthVacations(schedule, daysInMonth, year, month) {
    staffList.forEach(staff => {
        const actualShifts = calculateActualShiftDays(staff, schedule);
        const expectedShifts = staff.personalExpectedDays;
        
        if (actualShifts < expectedShifts) {
            const lastWeek = daysInMonth - 6;
            const hasEndOfMonthVacation = staff.preVacationDates.some(date => date >= lastWeek);
            
            if (hasEndOfMonthVacation) {
                const shiftsToAdd = expectedShifts - actualShifts;
                addShiftsForStaff(staff, schedule, shiftsToAdd, daysInMonth, year, month);
            }
        }
    });
}
function addShiftsForStaff(staff, schedule, shiftsToAdd, daysInMonth, year, month) {
    let availableDays = [];
    for (let day = 1; day <= daysInMonth; day++) {
        if (!isPreVacationDay(staff, day) && !isStaffWorkingOnDay(staff, day, schedule)) {
            availableDays.push(day);
        }
    }

    // 打亂可用日期順序，以隨機分配班次
    shuffleArray(availableDays);

    let addedShifts = 0;
    for (let i = 0; i < availableDays.length && addedShifts < shiftsToAdd; i++) {
        const day = availableDays[i];
        const availableShifts = Object.values(SHIFTS).filter(shift => 
            schedule[day][shift].length < getRequiredStaffForShift(shift) &&
            !wouldCauseConsecutiveViolation(staff, day, schedule) &&
            !wouldCreateForbiddenShiftConnection(staff, day, shift, schedule)
        );

        if (availableShifts.length > 0) {
            const randomShift = availableShifts[Math.floor(Math.random() * availableShifts.length)];
            schedule[day][randomShift].push(staff.name);
            addedShifts++;
        }
    }
}
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}
function assignRemainingShifts(schedule, daysInMonth) {
    // 識別月底有預休的員工
    const lastWeek = daysInMonth - 6;
    const staffWithEndMonthVacation = staffList.filter(staff => 
        staff.preVacationDates.some(date => date >= lastWeek)
    );

    // 優先為月底有預休的員工分配班次
    for (let day = 1; day <= daysInMonth; day++) {
        for (let shift in SHIFTS) {
            const requiredStaff = getRequiredStaffForShift(SHIFTS[shift]);
            while (schedule[day][SHIFTS[shift]].length < requiredStaff) {
                const availableStaff = getAvailableStaffForShift(day, SHIFTS[shift], schedule)
                    .filter(staff => {
                        // 如果是第一天，檢查是否與上個月最後一天的班次相符
                        if (day === 1 && staff.lastMonthLastDayShift) {
                            return staff.lastMonthLastDayShift === SHIFTS[shift];
                        }
                        return true;
                    })
                    .sort((a, b) => {
                        const aHasEndMonthVacation = staffWithEndMonthVacation.includes(a);
                        const bHasEndMonthVacation = staffWithEndMonthVacation.includes(b);
                        if (aHasEndMonthVacation && !bHasEndMonthVacation) return -1;
                        if (!aHasEndMonthVacation && bHasEndMonthVacation) return 1;
                        return calculateActualShiftDays(a, schedule) - calculateActualShiftDays(b, schedule);
                    });

                if (availableStaff.length > 0) {
                    schedule[day][SHIFTS[shift]].push(availableStaff[0].name);
                    // 如果該員工達到預期班次，從月底預休列表中移除
                    if (calculateActualShiftDays(availableStaff[0], schedule) >= availableStaff[0].personalExpectedDays) {
                        const index = staffWithEndMonthVacation.indexOf(availableStaff[0]);
                        if (index > -1) staffWithEndMonthVacation.splice(index, 1);
                    }
                } else {
                    break; // 如果沒有可用的員工，跳出循環
                }
            }
        }
    }
}


function getAvailableStaffForShift(day, shift, schedule) {
    return staffList.filter(staff =>
        calculateActualShiftDays(staff, schedule) < staff.personalExpectedDays &&
        !isStaffWorkingOnDay(staff, day, schedule) &&
        !wouldCauseConsecutiveViolation(staff, day, schedule) &&
        (shift === staff.shift1 || shift === staff.shift2) &&
        !isPreVacationDay(staff, day)
    ).sort((a, b) => calculateActualShiftDays(a, schedule) - calculateActualShiftDays(b, schedule));
}
// 模擬退火算法
function asyncSimulatedAnnealing(initialSchedule, year, month) {
    return new Promise((resolve, reject) => {
        let currentSchedule = JSON.parse(JSON.stringify(initialSchedule));
        let bestSchedule = JSON.parse(JSON.stringify(currentSchedule));
        let currentEnergy = calculateEnergy(currentSchedule, year, month);
        let bestEnergy = currentEnergy;

        const initialTemperature = 10000;
        const coolingRate = 0.99999; // 降低冷卻速率,使算法運行更久
        let temperature = initialTemperature;

        console.log("Starting simulated annealing...");
        console.log("Initial energy:", currentEnergy);

        startTime = Date.now();
        let iteration = 0;
        let noImprovementCount = 0;
        const maxNoImprovement = 1000000; // 增加允許的無改進次數

        function annealingStep() {
            const elapsedTime = Date.now() - startTime;
            const progress = Math.min((elapsedTime / expectedDuration) * 100, 99);
            updateProgress(progress);

            for (let i = 0; i < 1000; i++) {
                if (temperature > 0.1 && elapsedTime < expectedDuration && noImprovementCount < maxNoImprovement) {
                    let newSchedule = generateNeighbor(currentSchedule, year, month);
                    let newEnergy = calculateEnergy(newSchedule, year, month);

                    if (acceptanceProbability(currentEnergy, newEnergy, temperature) > Math.random()) {
                        currentSchedule = newSchedule;
                        currentEnergy = newEnergy;

                        if (currentEnergy < bestEnergy) {
                            bestSchedule = JSON.parse(JSON.stringify(currentSchedule));
                            bestEnergy = currentEnergy;
                            noImprovementCount = 0;
                            console.log(`New best energy found: ${bestEnergy} at iteration ${iteration}`);
                        } else {
                            noImprovementCount++;
                        }
                    } else {
                        noImprovementCount++;
                    }

                    temperature *= coolingRate;
                    iteration++;
                } else {
                    console.log("Simulated annealing completed.");
                    console.log(`Final best energy: ${bestEnergy}`);
                    console.log(`Total iterations: ${iteration}`);
                    updateProgress(100); // 確保最後顯示100%
                    resolve(bestSchedule);
                    return;
                }
            }

            // 如果找到一個完美的解決方案，提前結束
            if (bestEnergy === 0) {
                console.log("Perfect solution found. Ending simulated annealing early.");
                updateProgress(100);
                resolve(bestSchedule);
                return;
            }

            // 設置下一個步驟
            setTimeout(annealingStep, 0);
        }

        // 開始退火過程
        setTimeout(annealingStep, 0);
    });
}


// 模擬退火算法
function simulatedAnnealing(initialSchedule, year, month) {
    let currentSchedule = JSON.parse(JSON.stringify(initialSchedule));
    let bestSchedule = JSON.parse(JSON.stringify(currentSchedule));
    let currentEnergy = calculateEnergy(currentSchedule, year, month);
    let bestEnergy = currentEnergy;

    const initialTemperature = 10000;
    const coolingRate = 0.99995;
    let temperature = initialTemperature;

    console.log("Starting simulated annealing...");
    console.log("Initial energy:", currentEnergy);

    iteration = 0; // 重置迭代計數器
    while (temperature > 0.1 && iteration < maxIterations) {
        let newSchedule = generateNeighbor(currentSchedule, year, month);
        let newEnergy = calculateEnergy(newSchedule, year, month);

        if (acceptanceProbability(currentEnergy, newEnergy, temperature) > Math.random()) {
            currentSchedule = newSchedule;
            currentEnergy = newEnergy;

            if (currentEnergy < bestEnergy) {
                bestSchedule = JSON.parse(JSON.stringify(currentSchedule));
                bestEnergy = currentEnergy;
                console.log(`New best energy found: ${bestEnergy} at iteration ${iteration}`);
            }
        }

        temperature *= coolingRate;
        iteration++;

        if (iteration % 10000 === 0) {
            console.log(`Iteration: ${iteration}, Temperature: ${temperature}, Current Energy: ${currentEnergy}, Best Energy: ${bestEnergy}`);
        }

        // 如果找到一個完美的解決方案，提前結束
        if (bestEnergy === 0) {
            console.log("Perfect solution found. Ending simulated annealing early.");
            break;
        }
    }

    console.log("Simulated annealing completed.");
    console.log(`Final best energy: ${bestEnergy}`);
    console.log(`Total iterations: ${iteration}`);

    return bestSchedule;
}

// 生成鄰近解
function generateNeighbor(schedule, year, month) {
    let newSchedule = JSON.parse(JSON.stringify(schedule));
    const day1 = Math.floor(Math.random() * Object.keys(schedule).length) + 1;
    const day2 = Math.floor(Math.random() * Object.keys(schedule).length) + 1;
    const shift1 = Object.values(SHIFTS)[Math.floor(Math.random() * Object.values(SHIFTS).length)];
    const shift2 = Object.values(SHIFTS)[Math.floor(Math.random() * Object.values(SHIFTS).length)];

    if (newSchedule[day1][shift1].length > 0 && newSchedule[day2][shift2].length > 0) {
        const staff1Index = Math.floor(Math.random() * newSchedule[day1][shift1].length);
        const staff2Index = Math.floor(Math.random() * newSchedule[day2][shift2].length);
        const staff1 = staffList.find(s => s.name === newSchedule[day1][shift1][staff1Index]);
        const staff2 = staffList.find(s => s.name === newSchedule[day2][shift2][staff2Index]);

        // 檢查交換是否符合所有條件
        if (isValidSwap(staff1, staff2, day1, day2, shift1, shift2, newSchedule)) {
            // 交換班次
            [newSchedule[day1][shift1][staff1Index], newSchedule[day2][shift2][staff2Index]] = 
            [newSchedule[day2][shift2][staff2Index], newSchedule[day1][shift1][staff1Index]];
        }
    }

    return newSchedule;
}

// 檢查是否會超過連續工作天數限制
function wouldExceedConsecutiveWorkDays(staff, day, schedule) {
    let consecutiveDays = 0;
    // 檢查當前日期前的連續工作天數
    for (let i = day - 1; i > 0 && consecutiveDays < 6; i--) {
        if (isStaffWorkingOnDay(staff, i, schedule)) {
            consecutiveDays++;
        } else {
            break;
        }
    }
    // 檢查當前日期後的連續工作天數
    for (let i = day; i <= Object.keys(schedule).length && consecutiveDays < 6; i++) {
        if (i === day || isStaffWorkingOnDay(staff, i, schedule)) {
            consecutiveDays++;
        } else {
            break;
        }
    }
    return consecutiveDays > 6;
}

// 檢查交換是否有效
function isValidSwap(staff1, staff2, day1, day2, shift1, shift2, schedule) {
    return (shift1 === staff2.shift1 || shift1 === staff2.shift2) &&
           (shift2 === staff1.shift1 || shift2 === staff1.shift2) &&
           !isStaffWorkingOnDay(staff1, day2, schedule) &&
           !isStaffWorkingOnDay(staff2, day1, schedule) &&
           !isPreVacationDay(staff1, day2) &&
           !isPreVacationDay(staff2, day1) &&
           !wouldCreateForbiddenShiftConnection(staff1, day2, shift2, schedule) &&
           !wouldCreateForbiddenShiftConnection(staff2, day1, shift1, schedule) &&
           !wouldExceedConsecutiveWorkDays(staff1, day2, schedule) &&
           !wouldExceedConsecutiveWorkDays(staff2, day1, schedule);
}

// 計算能量（評估排班表的好壞）
function calculateEnergy(schedule, year, month) {
    let energy = 0;

    // 絕對不能違反的規則使用非常大的懲罰值而不是無限大
    const forbiddenShiftViolations = checkForbiddenShiftConnections(schedule) * 100000;
    const preVacationViolations = checkPreVacationViolations(schedule) * 100000;
    const consecutiveWorkDaysViolations = checkConsecutiveWorkDays(schedule) * 100000;
    const actualVsExpectedViolations = checkActualVsExpectedShifts(schedule) * 100000;

    // 計算其他可以優化但不是絕對要求的條件的能量值
    energy += forbiddenShiftViolations;
    energy += preVacationViolations;
    energy += consecutiveWorkDaysViolations;
    energy += actualVsExpectedViolations;
    energy += checkShiftCoverage(schedule) * 3000;
    energy += checkPreferredShiftsStrict(schedule) * 1000;
    energy += checkIsolatedWorkDays(schedule) * 200;
    energy += checkRestBetweenShifts(schedule) * 200;

    // 加入一個小的隨機因素，避免局部最優
    energy += Math.random() * 0.1;

    // 對於月底預休但排班數不足的情況增加懲罰值
    const endOfMonthVacationViolations = checkMonthEndVacationPriority(schedule, year, month);
    energy += endOfMonthVacationViolations * 50000; // 使用非常大的懲罰值

    return energy;
}



// 檢查禁止的班次連接
function checkForbiddenShiftConnections(schedule) {
    let violations = 0;
    
    staffList.forEach(staff => {
        for (let day = 1; day < Object.keys(schedule).length; day++) {
            const todayShift = getStaffShiftForDay(staff, day, schedule);
            const tomorrowShift = getStaffShiftForDay(staff, day + 1, schedule);
            
            if (isForbiddenShiftConnection(todayShift, tomorrowShift)) {
                violations++;
            }
        }
    });
    
    return violations;
}

// 判斷兩個班次的連接是否被禁止
function isForbiddenShiftConnection(shift1, shift2) {
    if (!shift1 || !shift2) return false;

    const forbiddenConnections = [
        [SHIFTS.EVENING, SHIFTS.NIGHT],
        [SHIFTS.EVENING, SHIFTS.DAY],
        [SHIFTS.NIGHT, SHIFTS.DAY]
    ];

    return forbiddenConnections.some(connection =>
        connection[0] === shift1 && connection[1] === shift2
    );
}

// 檢查預休日違規
function checkPreVacationViolations(schedule) {
    let violations = 0;
    for (let day in schedule) {
        for (let shift in schedule[day]) {
            schedule[day][shift].forEach(staffName => {
                const staff = staffList.find(s => s.name === staffName);
                if (isPreVacationDay(staff, parseInt(day))) {
                    violations++;
                }
            });
        }
    }
    return violations;
}
// 檢查連續工作天數
function checkConsecutiveWorkDays(schedule) {
    let violations = 0;
    staffList.forEach(staff => {
        let consecutiveDays = 0;
        for (let day = 1; day <= Object.keys(schedule).length; day++) {
            if (isStaffWorkingOnDay(staff, day, schedule)) {
                consecutiveDays++;
                if (consecutiveDays > 6) {
                    violations++;
                    break;  // 一旦發現違規,就停止檢查這個員工
                }
            } else {
                consecutiveDays = 0;
            }
        }
    });
    return violations;
}

// 檢查實際排班數與預期排班數的差異
function checkActualVsExpectedShifts(schedule) {
    let violations = 0;
    staffList.forEach(staff => {
        const actualShifts = calculateActualShiftDays(staff, schedule);
        if (actualShifts !== staff.personalExpectedDays) {
            violations++;
        }
    });
    return violations;
}

// 檢查班次覆蓋情況
function checkShiftCoverage(schedule) {
    let violations = 0;
    for (let day in schedule) {
        for (let shift in SHIFTS) {
            const requiredStaff = getRequiredStaffForShift(SHIFTS[shift]);
            if (schedule[day][SHIFTS[shift]].length !== requiredStaff) {
                violations += Math.abs(schedule[day][SHIFTS[shift]].length - requiredStaff);
            }
        }
    }
    return violations;
}

// 檢查偏好班次
function checkPreferredShiftsStrict(schedule) {
    let violations = 0;
    staffList.forEach(staff => {
        for (let day in schedule) {
            for (let shift in schedule[day]) {
                if (schedule[day][shift].includes(staff.name) && 
                    shift !== staff.shift1 && 
                    shift !== staff.shift2) {
                    violations++;
                }
            }
        }
    });
    return violations;
}

// 檢查孤立工作日
function checkIsolatedWorkDays(schedule) {
    let violations = 0;
    staffList.forEach(staff => {
        for (let day = 2; day < Object.keys(schedule).length; day++) {
            if (isStaffWorkingOnDay(staff, day, schedule) &&
                !isStaffWorkingOnDay(staff, day - 1, schedule) &&
                !isStaffWorkingOnDay(staff, day + 1, schedule)) {
                violations++;
            }
        }
    });
    return violations;
}

// 檢查班次間的休息時間
function checkRestBetweenShifts(schedule) {
    let violations = 0;
    staffList.forEach(staff => {
        for (let day = 2; day <= Object.keys(schedule).length; day++) {
            const yesterdayShift = getStaffShiftForDay(staff, day - 1, schedule);
            const todayShift = getStaffShiftForDay(staff, day, schedule);
            if ((yesterdayShift === SHIFTS.NIGHT && todayShift === SHIFTS.DAY) ||
                (yesterdayShift === SHIFTS.EVENING && todayShift === SHIFTS.DAY) ||
                (yesterdayShift === SHIFTS.EVENING && todayShift === SHIFTS.NIGHT)) {
                violations++;
            }
        }
    });
    return violations;
}

// 檢查月底預休集中的優先度
function checkMonthEndVacationPriority(schedule, year, month) {
    let violations = 0;
    const daysInMonth = new Date(year, month, 0).getDate();
    const lastWeek = daysInMonth - 6;

    staffList.forEach(staff => {
        const lastWeekVacations = staff.preVacationDates.filter(date => date >= lastWeek).length;
        const lastWeekShifts = Object.keys(schedule).filter(day => day >= lastWeek && isStaffWorkingOnDay(staff, day, schedule)).length;
        if (lastWeekVacations > 0 && lastWeekShifts > 0) {
            violations += lastWeekShifts;
        }
    });
    return violations;
}


// 計算接受新解的概率
function acceptanceProbability(currentEnergy, newEnergy, temperature) {
    if (newEnergy < currentEnergy) {
        return 1;
    }
    return Math.exp((currentEnergy - newEnergy) / temperature);
}

// 計算員工實際排班天數
function calculateActualShiftDays(staff, schedule) {
    return Object.values(schedule).reduce((count, daySchedule) => {
        return count + Object.values(daySchedule).filter(staffList => staffList.includes(staff.name)).length;
    }, 0);
}

// 檢查員工是否在特定日期工作
function isStaffWorkingOnDay(staff, day, schedule) {
    return Object.values(SHIFTS).some(shift => schedule[day][shift].includes(staff.name));
}

// 獲取員工在特定日期的班次
function getStaffShiftForDay(staff, day, schedule) {
    for (let shift in schedule[day]) {
        if (schedule[day][shift].includes(staff.name)) {
            return shift;
        }
    }
    return null;
}

// 檢查是否為預休日
function isPreVacationDay(staff, day) {
    return staff.preVacationDates.includes(day);
}

// 檢查是否會導致連續工作天數違規
function wouldCauseConsecutiveViolation(staff, day, schedule) {
    let consecutiveDays = staff.consecutiveWorkDays;
    for (let i = 1; i < day; i++) {
        if (isStaffWorkingOnDay(staff, i, schedule)) {
            consecutiveDays++;
        } else {
            consecutiveDays = 0;
        }
    }
    return consecutiveDays >= 6;
}

// 檢查是否會產生禁止的班次連接
function wouldCreateForbiddenShiftConnection(staff, day, shift, schedule) {
    const previousDay = day - 1;
    const nextDay = day + 1;
    
    if (previousDay > 0) {
        const previousShift = getStaffShiftForDay(staff, previousDay, schedule);
        if (isForbiddenShiftConnection(previousShift, shift)) {
            return true;
        }
    }
    
    if (nextDay <= Object.keys(schedule).length) {
        const nextShift = getStaffShiftForDay(staff, nextDay, schedule);
        if (isForbiddenShiftConnection(shift, nextShift)) {
            return true;
        }
    }
    
    return false;
}

// 獲取特定班次所需的員工數量
function getRequiredStaffForShift(shift) {
    switch (shift) {
        case SHIFTS.DAY:
            return dayShiftCount;
        case SHIFTS.EVENING:
            return eveningShiftCount;
        case SHIFTS.NIGHT:
            return nightShiftCount;
        default:
            return 0;
    }
}

// 最終排班檢查
function finalScheduleCheck(schedule) {
    let violations = [];
    
    // 檢查預休日違規
    staffList.forEach(staff => {
        staff.preVacationDates.forEach(day => {
            if (isStaffWorkingOnDay(staff, day, schedule)) {
                violations.push(`${staff.name} 在預休日 ${day} 被排班`);
            }
        });
    });
    
    // 檢查禁止的班次連接
    for (let day = 1; day < Object.keys(schedule).length; day++) {
        Object.values(SHIFTS).forEach(shift => {
            schedule[day][shift].forEach(staffName => {
                const staff = staffList.find(s => s.name === staffName);
                const nextDayShift = getStaffShiftForDay(staff, day + 1, schedule);
                if (isForbiddenShiftConnection(shift, nextDayShift)) {
                    violations.push(`${staff.name} 在第 ${day} 天的 ${SHIFT_DISPLAY[shift]} 後接 ${SHIFT_DISPLAY[nextDayShift]}`);
                }
            });
        });
    }
    
    // 檢查連續工作天數
    staffList.forEach(staff => {
        let consecutiveDays = staff.consecutiveWorkDays;
        let startDay = 1;
        for (let day = 1; day <= Object.keys(schedule).length; day++) {
            if (isStaffWorkingOnDay(staff, day, schedule)) {
                consecutiveDays++;
                if (consecutiveDays > 6) {
                    violations.push(`${staff.name} 從第 ${startDay} 天開始連續工作超過6天`);
                    break;
                }
            } else {
                consecutiveDays = 0;
                startDay = day + 1;
            }
        }
    });
    
    return violations;
}

// 初始化事件監聽器
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('generateScheduleBtn').addEventListener('click', function() {
        updateShiftCounts();
        generateSchedule();
    });
});

// 更新班次數量
function updateShiftCounts() {
    dayShiftCount = parseInt(document.getElementById('dayShiftCount').value) || 0;
    eveningShiftCount = parseInt(document.getElementById('eveningShiftCount').value) || 0;
    nightShiftCount = parseInt(document.getElementById('nightShiftCount').value) || 0;
    console.log("Updated shift counts:", dayShiftCount, eveningShiftCount, nightShiftCount);
}
// 添加 displayStatistics 函數
function displayStatistics(schedule) {
    const statisticsTable = document.getElementById('statisticsTable');
    
    let tableHTML = `
        <table class="statistics-table">
            <thead>
                <tr>
                    <th>員工名稱</th>
                    <th>個人預期班數</th>
                    <th>實際班數</th>
                    <th>白班天數</th>
                    <th>小夜天數</th>
                    <th>大夜天數</th>
                </tr>
            </thead>
            <tbody>
    `;

    staffList.forEach(staff => {
        const expectedDays = staff.personalExpectedDays;
        let actualDays = 0;
        let dayShiftDays = 0;
        let eveningShiftDays = 0;
        let nightShiftDays = 0;

        for (let day = 1; day <= Object.keys(schedule).length; day++) {
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

// 添加 displayScheduleMatrix 函數
function displayScheduleMatrix(schedule, year, month) {
    const scheduleMatrixDiv = document.getElementById('scheduleMatrix');
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    
    let tableHTML = `
        <table class="schedule-matrix">
            <thead>
                <tr>
                    <th>人員 \ 日期</th>
    `;
    
    for (let day = 1; day <= Object.keys(schedule).length; day++) {
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
        
        for (let day = 1; day <= Object.keys(schedule).length; day++) {
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
// 顯示排班表
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

    for (let day = 1; day <= Object.keys(schedule).length; day++) {
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
    console.log("Schedule to display:", schedule);
}