import type { Application, MainStage } from './types'
import {
  MAIN_STAGE_COLUMNS,
  getCurrentKeyTime,
  getCurrentStageLabel,
  getMainStage,
  getRiskBadges,
} from './utils'

const STAGE_COLORS: Record<MainStage, string> = {
  待投递: 'E2E8F0',
  已投递: 'E0F2FE',
  笔试中: 'FEF3C7',
  面试中: 'EDE9FE',
  'Offer中': 'D1FAE5',
  已结束: 'F1F5F9',
}

function toExcelDate(value?: string): Date | string {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date
}

function getFileDate() {
  const now = new Date()
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export async function exportApplicationsToExcel(applications: Application[]): Promise<void> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ApplyBoard'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.calcProperties.fullCalcOnLoad = true

  const detailSheet = workbook.addWorksheet('申请明细', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })
  detailSheet.properties.defaultRowHeight = 20
  detailSheet.columns = [
    { header: '序号', key: 'index', width: 8 },
    { header: '公司名称', key: 'company', width: 22 },
    { header: '岗位名称', key: 'position', width: 28 },
    { header: '岗位链接', key: 'link', width: 14 },
    { header: '当前大阶段', key: 'mainStage', width: 14 },
    { header: '当前节点', key: 'currentStage', width: 16 },
    { header: '关键时间/进度', key: 'keyTime', width: 25 },
    { header: '风险提醒', key: 'risk', width: 20 },
    { header: '使用简历版本', key: 'resume', width: 22 },
    { header: '备注', key: 'note', width: 42 },
    { header: '创建时间', key: 'createdAt', width: 19 },
    { header: '最近更新时间', key: 'updatedAt', width: 19 },
  ]

  const sortedApplications = [...applications].sort((first, second) => {
    const stageDifference =
      MAIN_STAGE_COLUMNS.indexOf(getMainStage(first.currentStage)) -
      MAIN_STAGE_COLUMNS.indexOf(getMainStage(second.currentStage))
    if (stageDifference !== 0) {
      return stageDifference
    }
    return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
  })

  sortedApplications.forEach((application, index) => {
    const mainStage = getMainStage(application.currentStage)
    const row = detailSheet.addRow({
      index: index + 1,
      company: application.company,
      position: application.position,
      link: application.link ? { text: '打开岗位', hyperlink: application.link } : '',
      mainStage,
      currentStage: getCurrentStageLabel(application),
      keyTime: getCurrentKeyTime(application),
      risk: getRiskBadges(application).map((badge) => badge.label).join('、') || '推进中',
      resume: application.resumeVersion?.trim() || '未指定',
      note: application.jdNote ?? '',
      createdAt: toExcelDate(application.createdAt),
      updatedAt: toExcelDate(application.updatedAt),
    })

    row.alignment = { vertical: 'middle' }
    row.getCell('link').font = { color: { argb: 'FF0284C7' }, underline: true }
    row.getCell('mainStage').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${STAGE_COLORS[mainStage]}` },
    }
    row.getCell('mainStage').alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell('currentStage').alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell('note').alignment = { vertical: 'top', wrapText: true }
    row.getCell('createdAt').numFmt = 'yyyy-mm-dd hh:mm'
    row.getCell('updatedAt').numFmt = 'yyyy-mm-dd hh:mm'
    row.height = 48
  })

  const detailHeader = detailSheet.getRow(1)
  detailHeader.height = 26
  detailHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  detailHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
  detailHeader.alignment = { horizontal: 'center', vertical: 'middle' }
  detailSheet.autoFilter = { from: 'A1', to: 'L1' }

  const lastDetailRow = Math.max(2, detailSheet.rowCount)
  for (let rowNumber = 1; rowNumber <= lastDetailRow; rowNumber += 1) {
    for (let columnNumber = 1; columnNumber <= 12; columnNumber += 1) {
      detailSheet.getCell(rowNumber, columnNumber).border = {
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      }
    }
  }

  const summarySheet = workbook.addWorksheet('求职概览', {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  })
  summarySheet.columns = [{ width: 22 }, { width: 18 }, { width: 18 }]
  summarySheet.mergeCells('A1:C1')
  summarySheet.getCell('A1').value = 'ApplyBoard 求职情况概览'
  summarySheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } }
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
  summarySheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }
  summarySheet.getRow(1).height = 34

  summarySheet.mergeCells('A2:C2')
  summarySheet.getCell('A2').value = `导出时间：${new Date().toLocaleString('zh-CN')} · 数据范围：当前页面 ${applications.length} 条申请`
  summarySheet.getCell('A2').font = { color: { argb: 'FF64748B' }, size: 10 }
  summarySheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }
  summarySheet.getRow(2).height = 24

  summarySheet.getRow(4).values = ['申请总数', '进行中', '已结束']
  summarySheet.getRow(5).values = [
    { formula: `COUNTA('申请明细'!B2:B${lastDetailRow})`, result: applications.length },
    {
      formula: 'A5-C5',
      result: applications.filter((item) => getMainStage(item.currentStage) !== '已结束').length,
    },
    {
      formula: `COUNTIF('申请明细'!E2:E${lastDetailRow},"已结束")`,
      result: applications.filter((item) => getMainStage(item.currentStage) === '已结束').length,
    },
  ]
  summarySheet.getRow(4).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF475569' } }
    cell.alignment = { horizontal: 'center' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } }
  })
  summarySheet.getRow(5).eachCell((cell) => {
    cell.font = { bold: true, size: 20, color: { argb: 'FF312E81' } }
    cell.alignment = { horizontal: 'center' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } }
  })

  summarySheet.getRow(8).values = ['流程阶段', '申请数量', '占比']
  MAIN_STAGE_COLUMNS.forEach((stage, index) => {
    const rowNumber = 9 + index
    const count = applications.filter((item) => getMainStage(item.currentStage) === stage).length
    summarySheet.getRow(rowNumber).values = [
      stage,
      {
        formula: `COUNTIF('申请明细'!E2:E${lastDetailRow},A${rowNumber})`,
        result: count,
      },
      { formula: `IF($A$5=0,0,B${rowNumber}/$A$5)`, result: applications.length ? count / applications.length : 0 },
    ]
    summarySheet.getCell(`A${rowNumber}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${STAGE_COLORS[stage]}` },
    }
    summarySheet.getCell(`C${rowNumber}`).numFmt = '0%'
  })
  summarySheet.getRow(8).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } }
  })
  for (let rowNumber = 8; rowNumber <= 14; rowNumber += 1) {
    summarySheet.getRow(rowNumber).eachCell((cell) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
  }

  summarySheet.mergeCells('A17:C18')
  summarySheet.getCell('A17').value = '说明：本文件仅导出申请记录，不包含账号信息和简历文件。岗位链接可直接点击打开。'
  summarySheet.getCell('A17').font = { size: 10, color: { argb: 'FF64748B' } }
  summarySheet.getCell('A17').alignment = { vertical: 'middle', wrapText: true }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = `ApplyBoard求职情况_${getFileDate()}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(downloadUrl)
}
